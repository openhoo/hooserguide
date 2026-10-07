# Third-party notices

## pdfcn

Source: https://github.com/shadcn-labs/pdfcn

Pinned commit: `39c75c1abbbad7b89ad1d8d3ea740ef635818a4b`

Vendored registry items: Forme utils, professional theme, Text, Heading, PdfImage, PageNumber and PageFooter. Files are in `src/pdfcn/`. Import aliases were converted to local ESM paths; TypeScript null assertions were added for strict index checking. The Heading wrapper uses Forme semantic H1-H6 elements while preserving its theme styles. The PdfImage wrapper forwards alternative text to Forme images so tagged PDF figures retain their accessible descriptions. The project theme customizes colors and headings outside the vendored source. Original license is retained in `src/pdfcn/LICENSE` and copied into `dist/pdfcn/LICENSE` for distribution.

These third-party files remain MIT licensed; original hooserguide code is Apache-2.0. Other npm dependencies retain the licenses shipped by their respective packages.

```text
MIT License

Copyright (c) 2026 Shadcn Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
