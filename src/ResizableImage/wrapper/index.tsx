import React from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { Resizable } from "re-resizable";
import { Node as ProsemirrorNode } from "prosemirror-model";
import { Direction } from "re-resizable/lib/resizer";
interface WrapperProps {
  node: ProsemirrorNode;
  updateAttributes: (attrs: unknown) => void;
}

export default function ResizableImageWrapper(props: WrapperProps) {
  const defaultWidth = props.node.attrs.width;
  const defaultHeight = props.node.attrs.height;

  function getLength(unit: string | undefined) {
    if (!unit) return 0;
    return parseInt(unit.split("px")[0]);
  }

  return (
    <NodeViewWrapper className="image-resizer">
      <Resizable
        defaultSize={{
          width: defaultWidth ? defaultWidth : "300",
          height: defaultHeight ? defaultHeight : "300",
        }}
        onResize={(
          e: MouseEvent | TouchEvent,
          direction: Direction,
          ref: HTMLElement
        ) => {
          const updatedWidth = getLength(ref.style.width);
          const updatedHeight = getLength(ref.style.height);
          props.updateAttributes({
            width: `${updatedWidth}px`,
            height: `${updatedHeight}px`,
          });
        }}
        maxWidth={"100%"}
        style={{
          backgroundImage: `url(${props.node.attrs.src})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
        }}
        lockAspectRatio={false}
      ></Resizable>
    </NodeViewWrapper>
  );
}
