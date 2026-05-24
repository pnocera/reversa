# Price Estimate

**Feature:** `_reversa_sdd/forward/042-pagamento-pix`
**Generated at:** 2026-05-06 16:42 UTC
**Calculation versions:** Effort v2.0, Value v2.0, Market v2.0

**Prerequisites consumed:**
- Profile: `_reversa_sdd/_pricing/profile.json`
- Size: `_reversa_sdd/_pricing/042-pagamento-pix/size.json` (class `L`, auxiliary score `60`)

## Overview

| Scenario | Range | Comment |
|---|---|---|
| **Effort** | 4,800.00 to 12,000.00 BRL | 32 to 80h, cost + tax + markup |
| **Value** | 2,400.00 to 7,200.00 BRL | 10% to 30% of declared annual value |
| **Market Range** | 3,200.00 to 16,000.00 BRL | hourly rate sourced by country and seniority |

## Effort Scenario

**What it is:** price calculated from probable hours, hourly rate, approximate tax reserve, and project markup. It is the defensible floor to avoid subsidizing the client.

**When to use:** always as a sanity check. Charging below Effort means taking a loss or cutting the project profit too thin.

| Item | Value |
|---|---|
| Complexity class | L |
| Seniority | senior |
| Seniority factor | 1.00 |
| Estimated hours | 32 to 80 h |
| Midpoint | 56 h |
| Hourly rate | 100.00 BRL/h |
| Direct cost | 3,200.00 to 8,000.00 BRL |
| Approximate tax reserve | 480.00 to 1,200.00 BRL |
| Project markup (35%) | 1,120.00 to 2,800.00 BRL |
| **Effort Range** | **4,800.00 to 12,000.00 BRL** |
| Midpoint | 8,400.00 BRL |

Warning: part of the tax factor may be an itemized tax passed through to the client. Validate with your accountant.

## Value Scenario

**What it is:** price based on a portion of the annual economic value the feature generates or protects for the client. Reversa uses a capture of 10% to 30% of the declared annual value.

**When to use:** when the client can declare return, savings, or cost of not doing.

| Item | Value |
|---|---|
| Declared monthly return | 2,000.00 BRL |
| Users impacted | 500 |
| Cost of not doing | 5,000.00 BRL |
| Annual value used | 24,000.00 BRL |
| Capture applied | 10% to 30% |
| Recommended price | 4,800.00 BRL |
| **Value Range** | **2,400.00 to 7,200.00 BRL** |
| Approximate payback | 1.2 to 3.6 months |

## Market Range Scenario

**What it is:** range derived from hourly benchmark by country and seniority, multiplied by the same hours range from the Effort scenario.

**When to use:** as an external reference. v2 does not multiply by client profile because there is no reliable public dataset for that.

| Item | Value |
|---|---|
| Country / Seniority | Brazil / senior |
| Model / Client profile | escopo_fechado / pequena_empresa |
| Complexity | L |
| Market hourly rate | 100.00 to 200.00 BRL/h |
| Source type | salary_derived_freelance_estimate |
| Reference year | 2025-2026 |
| Sources | Portal Salario CAGED, Glassdoor Brasil |
| **Market Range** | **3,200.00 to 16,000.00 BRL** |

## How to choose among the three

The declared Value generates a smaller range than the average Effort. Use Effort as the defensible floor and Market as an external reference. For this client, charge below 4,800 BRL only if there is a clear strategic reason.

General heuristics:

1. Client without clear return: use Effort as floor and Market as external reference
2. Client with high, clear return: prefer Value, with Effort only as minimum floor
3. Effort above Market: review profile, size, or client fit
4. Market above Effort: there is room to raise markup or improve the proposal

## Disclaimer

The numbers in this estimate are approximations for budget guidance, not a guarantee of closing a sale. The tax factor is an approximate reserve, not an exact legal tax rate. Real tax validation is the responsibility of the user's accountant. The market range is static and based on the sources documented in `market-benchmarks.md`. The return declared by the client in the Value scenario is raw input, not validated. It is recommended to add `_reversa_sdd/_pricing/<feature>/estimate.{md,json}` to `.gitignore` before committing.
