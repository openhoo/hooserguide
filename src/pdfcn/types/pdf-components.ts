// Vendored from pdfcn 39c75c1abbbad7b89ad1d8d3ea740ef635818a4b; MIT. See THIRD_PARTY_NOTICES.md.
import type { ReactNode } from "react";

/** CSS-like style object compatible with both Takumi and Forme */
export type Style = Record<string, unknown>;

/**
 * Base props shared by all pdfcn PDF components.
 */
export interface PDFComponentProps {
  style?: Style;
  children: ReactNode;
}
