import React from "react";
import { Node as ProsemirrorNode } from "prosemirror-model";
interface WrapperProps {
    node: ProsemirrorNode;
    updateAttributes: (attrs: unknown) => void;
}
export default function ResizableImageWrapper(props: WrapperProps): React.JSX.Element;
export {};
