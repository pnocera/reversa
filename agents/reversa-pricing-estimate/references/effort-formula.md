# Effort Scenario Formula (effort-formula.md)

**Formula version:** 2.0

Documents the deterministic calculation that the `reversa-pricing-estimate` agent applies for the Effort scenario. Formula v2 removes the old linear score-to-hours conversion and uses hours ranges by T-shirt size, with a seniority factor inspired by the personnel capability multipliers from COCOMO II.

## Source and rationale

COCOMO II is a parametric effort estimation model that uses size, product attributes, platform, personnel, and project attributes. For Reversa's UX, using the full model would be too complex. v2 uses only the defensible idea of personnel capability multipliers, keeping simple hours ranges by class.

Primary reference:

- Barry Boehm et al., *Software Cost Estimation with COCOMO II*, Prentice Hall, 2000
- Carnegie Mellon SEI, software cost estimation overview and COCOMO II: https://insights.sei.cmu.edu/blog/software-cost-estimation-explained/

## Step 1: base hours range for senior

```
hours_by_complexity_class_senior:
  S:   4 to 12 hours
  M:   12 to 32 hours
  L:   32 to 80 hours
  XL:  80 to 160 hours
  XXL: 160 to 320 hours, with a mandatory recommendation to split scope
```

These ranges are a Reversa heuristic, based on T-shirt sizing. They are more honest than a linear constant because software estimation has real uncertainty.

## Step 2: seniority factor

```
seniority_factor:
  junior:      1.34
  mid:         1.15
  senior:      1.00
  staff_lead:  0.88
  principal:   0.76
```

Accepted aliases for compatibility:

```
pleno -> mid
especialista -> staff_lead
staff -> staff_lead
lead -> staff_lead
```

## Step 3: estimated hours

```
hours_min = round(hours_min[complexity_class] * seniority_factor)
hours_max = round(hours_max[complexity_class] * seniority_factor)
hours_estimated = round((hours_min + hours_max) / 2)
```

The `hours_estimated` field is the midpoint for compatibility and summary. The range `hours_min` to `hours_max` must be displayed in estimate.md.

## Step 4: direct cost

```
direct_cost_min = hours_min * profile.hourly_rate
direct_cost_max = hours_max * profile.hourly_rate
direct_cost = hours_estimated * profile.hourly_rate
```

## Step 5: approximate tax

```
approximate_tax_min = direct_cost_min * profile.tax_factor
approximate_tax_max = direct_cost_max * profile.tax_factor
approximate_tax = direct_cost * profile.tax_factor
```

When `profile.tax_regime == "outro"` or `tax_factor = 0`, the tax is not computed and estimate.md must show an explicit warning.

If the profile indicates that the factor includes VAT, IVA, or itemized tax on the invoice, estimate.md must warn that this amount may be passed through to the client and does not necessarily reduce margin.

## Step 6: project markup

The historical field `margin_percent` must be treated as **project markup over direct cost**, not as net accounting margin.

```
markup_min = direct_cost_min * (profile.margin_percent / 100)
markup_max = direct_cost_max * (profile.margin_percent / 100)
markup_applied = direct_cost * (profile.margin_percent / 100)
```

## Step 7: total price

```
price_minimum = round_currency(direct_cost_min + approximate_tax_min + markup_min)
price_maximum = round_currency(direct_cost_max + approximate_tax_max + markup_max)
price_total = round_currency(direct_cost + approximate_tax + markup_applied)
```

`price_total` is the range midpoint and exists for compatibility. estimate.md must highlight `price_minimum` to `price_maximum`.

## Example

```
profile:
  country = BR, currency = BRL, seniority = senior
  hourly_rate = 100.00, margin_percent = 35, tax_factor = 0.15

size:
  complexity_class = L

hours_by_complexity_class_senior[L] = 32 to 80
seniority_factor[senior] = 1.00
hours_min = 32
hours_max = 80
hours_estimated = 56

direct_cost_min = 3200.00
direct_cost_max = 8000.00
tax_min = 480.00
tax_max = 1200.00
markup_min = 1120.00
markup_max = 2800.00

price_minimum = 4800.00 BRL
price_maximum = 12000.00 BRL
price_total = 8400.00 BRL
```

## Conversion to billing currency

When `profile.billing_currency` and `profile.exchange_rate_to_local` are set:

```
billing_value = round_currency(local_value / exchange_rate_to_local)
```

estimate.md must print the rate used:

```
1 <billing_currency> = <exchange_rate_to_local> <currency>
```

## Limits

1. The formula does not mix team seniorities
2. XXL remains calculable, but must generate a strong recommendation to split scope
3. The hours range is a heuristic, not a delivery guarantee
4. `size_score` does not enter the hours calculation
