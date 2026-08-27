---
'@asenajs/asena-openapi': patch
---

A `.describe()` on the `json()` schema is now moved to `requestBody.description` instead of being copied there. The JSON schema itself no longer carries it, so docs UIs that print both (Scalar) stop showing the same sentence twice.
