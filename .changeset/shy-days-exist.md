---
'jats-convert': patch
---

Add custom handling for supplementary files

Previously, supplementary "media" nodes were treated as "generic children" if they were not known image types.
Now they are recognized and supported as download links without warnings.
