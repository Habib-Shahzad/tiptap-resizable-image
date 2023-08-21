import React from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { Resizable } from "re-resizable";
import { Node as ProsemirrorNode } from "prosemirror-model";

interface WrapperProps {
  node: ProsemirrorNode;
  updateAttributes: (attrs: unknown) => void;
}

export default function ResizableImageWrapper(props: WrapperProps) {
  return (
    <NodeViewWrapper className="image-resizer">
      <Resizable
        defaultSize={{
          width: props.node.attrs.width,
          height: props.node.attrs.height,
        }}
        onResize={(
          e: MouseEvent | TouchEvent,
          direction: any,
          ref: HTMLElement
        ) => {
          props.updateAttributes({
            width: ref.style.width,
            height: ref.style.height,
          });
        }}
        maxWidth={"100%"}
        style={{
          backgroundImage: `url(${props.node.attrs.src})`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        }}
        lockAspectRatio={true}
      ></Resizable>
    </NodeViewWrapper>
  );
}
