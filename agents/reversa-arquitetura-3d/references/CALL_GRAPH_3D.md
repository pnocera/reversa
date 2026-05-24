# Call Graph 3D

A tree (or DAG) of **function calls** explorable in 3D. Each node is a function, each edge is a call. Allows navigating the depth of an invocation chain starting from entry points (endpoints, handlers, main).

## Mapping

| Concept | Visual |
|---|---|
| Function | 3D capsule or pill with label |
| Call depth | Position on Z (depth axis) |
| Synchronous function | Solid capsule |
| Asynchronous function | Translucent capsule with particles |
| Recursive function | Capsule with glow (emissive) |
| Hot path (frequency) | Thicker line, saturated color |
| External function (lib) | Gray color |
| Project function | Color by folder/module |

## When to use

- Understand the execution flow of a specific endpoint.
- Diagnose excessive call depth (>15 levels, a sign of overengineering).
- Detect indirect recursion.
- Present how the system responds to a typical request.

**When to avoid**: static analysis without execution data is incomplete (does not capture polymorphism). For structural views use Dependency Graph 3D.

## Expected data model

```json
{
  "entrypoints": ["POST /api/orders", "handleWebhookStripe"],
  "calls": [
    {
      "from": "POST /api/orders",
      "to": "OrderController.create",
      "type": "sync",
      "weight": 1000
    },
    {
      "from": "OrderController.create",
      "to": "OrderService.placeOrder",
      "type": "sync",
      "weight": 1000
    },
    {
      "from": "OrderService.placeOrder",
      "to": "PaymentClient.charge",
      "type": "async",
      "weight": 1000
    }
  ]
}
```

`weight` is the relative frequency (number of invocations observed over a period). `type` is `sync`, `async`, `recursive`, or `external`.

## Layout algorithm: 3D radial tree

Each entry point becomes a tree root. Depth increases on the Z axis (moving away from the camera), functions at the same level are distributed on an XY plane.

```javascript
function layoutTree(entrypoint, calls) {
    const nodes = new Map();
    nodes.set(entrypoint, { id: entrypoint, depth: 0, x: 0, y: 0, z: 0, children: [] });

    function buildChildren(parentId, parentDepth) {
        const outgoing = calls.filter((c) => c.from === parentId);
        outgoing.forEach((c, i, arr) => {
            if (nodes.has(c.to)) {
                // detected recursion
                nodes.get(c.to).recursive = true;
                return;
            }
            const angle = (i / arr.length) * Math.PI * 2;
            const radius = parentDepth * 15 + 30;
            const node = {
                id: c.to,
                depth: parentDepth + 1,
                x: nodes.get(parentId).x + Math.cos(angle) * radius,
                y: nodes.get(parentId).y + Math.sin(angle) * radius,
                z: -(parentDepth + 1) * 40,
                type: c.type,
                weight: c.weight,
                children: []
            };
            nodes.set(c.to, node);
            nodes.get(parentId).children.push(node);
            buildChildren(c.to, parentDepth + 1);
        });
    }

    buildChildren(entrypoint, 0);
    return Array.from(nodes.values());
}
```

For multiple entry points, each occupies a region of the XY plane (center translation), creating parallel trees.

## Capsule rendering

```javascript
const capsuleGeo = new THREE.CapsuleGeometry(2, 6, 8, 12);
const capsuleMat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
const capsules = new THREE.InstancedMesh(capsuleGeo, capsuleMat, nodes.length);

nodes.forEach((n, i) => {
    const dummy = new THREE.Object3D();
    dummy.position.set(n.x, n.y, n.z);
    dummy.rotation.z = Math.PI / 2; // horizontal
    const scale = 0.6 + Math.log(1 + (n.weight ?? 1)) * 0.2;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    capsules.setMatrixAt(i, dummy.matrix);

    const color = new THREE.Color(colorForCall(n));
    capsules.setColorAt(i, color);
});
capsules.instanceMatrix.needsUpdate = true;
capsules.instanceColor.needsUpdate = true;
scene.add(capsules);
```

`colorForCall(n)` returns gray for externals, the folder color for internals, with emissive if `n.recursive`.

## Rendering calls (edges)

Bezier-style curved lines connecting parent to child. Thicker for high `weight`.

```javascript
calls.forEach((c) => {
    const src = nodesById.get(c.from);
    const dst = nodesById.get(c.to);
    if (!src || !dst) return;

    const mid = new THREE.Vector3(
        (src.x + dst.x) / 2,
        (src.y + dst.y) / 2 + 10,
        (src.z + dst.z) / 2
    );
    const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(src.x, src.y, src.z),
        mid,
        new THREE.Vector3(dst.x, dst.y, dst.z)
    );
    const tube = new THREE.TubeGeometry(curve, 20, 0.2 + Math.log(1 + c.weight) * 0.1, 6, false);
    const isAsync = c.type === "async";
    const mat = new THREE.MeshStandardMaterial({
        color: isAsync ? 0xb39ddb : 0x4a9eff,
        transparent: true,
        opacity: 0.6
    });
    scene.add(new THREE.Mesh(tube, mat));
});
```

## Flow animation (optional)

Particles traveling along edges, indicating the call is "live". Useful for presentations.

```javascript
function animateFlow(time) {
    edgeParticles.forEach((p) => {
        const t = (time * 0.001 + p.offset) % 1;
        const pos = p.curve.getPoint(t);
        p.mesh.position.copy(pos);
    });
}
```

## Controls sidebar

```html
<aside id="sidebar">
    <h3>Call Graph 3D</h3>

    <label>Entry point
        <select data-param="entrypoint">
            <!-- POPULATED -->
        </select>
    </label>

    <label>Maximum depth
        <input type="range" min="1" max="20" value="10" data-param="maxDepth">
    </label>

    <label>
        <input type="checkbox" data-param="showAsync" checked> Highlight async
    </label>

    <label>
        <input type="checkbox" data-param="showExternal"> Show external libs
    </label>

    <label>
        <input type="checkbox" data-param="animateFlow"> Animate flow
    </label>

    <div id="depth-info"></div>
    <div id="recursive-warnings"></div>

    <button id="reset">Reset</button>
    <button id="export-png">Export PNG</button>
</aside>
```

## Interaction

- **Hover on capsule**: function name, source module, number of callers and callees, type.
- **Click on capsule**: focuses camera, highlights the chain from entry point to this function.
- **Double-click**: expand/collapse subtree.
- **Toggle entry point**: changes the visualization root, recalculates layout.

## Performance

- Practical limit: ~500 functions per entry point.
- Above that, automatically collapse subtrees after depth 5 and show a "+N functions" button.
- Flow animation: limit to 50 simultaneous particles to avoid fps drop.
