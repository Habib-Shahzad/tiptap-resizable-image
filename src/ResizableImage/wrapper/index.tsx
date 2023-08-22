import React, { useState } from "react";
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

  const [marginLeft, setPaddingLeft] = useState(
    props.node.attrs?.marginLeft ?? 0
  );

  const handleLeftArrowClick = () => {
    props.updateAttributes({
      marginLeft,
    });
    setPaddingLeft(marginLeft - 10);
  };

  const handleRightArrowClick = () => {
    props.updateAttributes({
      marginLeft,
    });
    setPaddingLeft(marginLeft + 10);
  };

  return (
    <NodeViewWrapper className="image-resizer">
      <button className="arrow-button" onClick={handleLeftArrowClick}>
        &#8592;
      </button>
      &nbsp;&nbsp;
      <button className="arrow-button" onClick={handleRightArrowClick}>
        &#8594;
      </button>
      <div
        style={{
          marginTop: "10px",
        }}
      />
      <Resizable
        className="resizable-image"
        defaultSize={{
          width: defaultWidth ? defaultWidth : "300",
          height: defaultHeight ? defaultHeight : "300",
        }}
        onResize={(
          e: MouseEvent | TouchEvent,
          direction: Direction,
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
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          marginLeft: `${marginLeft}px`,
        }}
        lockAspectRatio={false}
      ></Resizable>
    </NodeViewWrapper>
  );
}
