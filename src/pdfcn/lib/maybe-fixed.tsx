// Vendored from pdfcn 39c75c1abbbad7b89ad1d8d3ea740ef635818a4b; MIT. See THIRD_PARTY_NOTICES.md.
import type { ReactNode } from "react";

import { Fixed, View } from "./pdf-primitives.js";
import type { Style } from "./pdf-primitives.js";

export const MaybeFixed = ({
  fixed,
  position,
  wrap,
  style,
  children,
}: {
  fixed?: boolean;
  position: "header" | "footer";
  wrap?: boolean;
  style?: Style | Style[];
  children?: ReactNode;
}) => {
  const view = (
    <View wrap={wrap} style={style as never}>
      {children}
    </View>
  );
  if (!fixed) {
    return view;
  }
  return <Fixed position={position}>{view}</Fixed>;
};
