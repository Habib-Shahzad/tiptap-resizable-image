'use strict';

var core = require('@tiptap/core');
var react = require('@tiptap/react');
var React = require('react');
var reResizable = require('re-resizable');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var React__default = /*#__PURE__*/_interopDefaultLegacy(React);

function ResizableImageWrapper(props) {
    return (React__default["default"].createElement(react.NodeViewWrapper, { className: "image-resizer" },
        React__default["default"].createElement(reResizable.Resizable, { defaultSize: {
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
const ResizableImage = core.Node.create({
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
        return ["img", core.mergeAttributes(this.options.HTMLAttributes, attributes)];
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
        return react.ReactNodeViewRenderer(ResizableImageWrapper);
    },
    addInputRules() {
        return [
            core.nodeInputRule({
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

module.exports = ResizableImage;
//# sourceMappingURL=tiptap-resize-image.js.map
