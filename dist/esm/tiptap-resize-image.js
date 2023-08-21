import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import React from 'react';
import { Resizable } from 're-resizable';

function ResizableImageWrapper(props) {
    return (React.createElement(NodeViewWrapper, { className: "image-resizer" },
        React.createElement(Resizable, { defaultSize: {
                width: props.node.attrs.width,
                height: props.node.attrs.height,
            }, onResize: (e, direction, ref) => {
                props.updateAttributes({
                    width: ref.style.width,
                    height: ref.style.height,
                });
            }, maxWidth: "100%", style: {
                backgroundImage: `url(${props.node.attrs.src})`,
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
            }, lockAspectRatio: true })));
}

const inputRegex = /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/;
const ResizableImage = Node.create({
    name: "image",
    addOptions() {
        return {
            inline: false,
            allowBase64: false,
            HTMLAttributes: {},
        };
    },
    inline() {
        return this.options.inline;
    },
    group() {
        return this.options.inline ? "inline" : "block";
    },
    draggable: true,
    addAttributes() {
        return {
            src: {
                default: null,
            },
            alt: {
                default: null,
            },
            title: {
                default: null,
            },
            height: {
                default: null,
            },
            width: {
                default: null,
            },
        };
    },
    parseHTML() {
        return [
            {
                tag: "img",
            },
        ];
    },
    renderHTML({ HTMLAttributes }) {
        const { height, width } = HTMLAttributes;
        const attributes = Object.assign(Object.assign({}, HTMLAttributes), { style: `height: ${height} !important; width: ${width} !important;` });
        return ["img", mergeAttributes(this.options.HTMLAttributes, attributes)];
    },
    addCommands() {
        return {
            setImage: (options) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: options,
                });
            },
        };
    },
    addNodeView() {
        return ReactNodeViewRenderer(ResizableImageWrapper);
    },
    addInputRules() {
        return [
            nodeInputRule({
                find: inputRegex,
                type: this.type,
                getAttributes: (match) => {
                    const [, , alt, src, title, height, width] = match;
                    return { src, alt, title, height, width };
                },
            }),
        ];
    },
});

export { ResizableImage as default };
//# sourceMappingURL=tiptap-resize-image.js.map
