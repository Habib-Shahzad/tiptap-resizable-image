import { Node } from "@tiptap/core";
interface ImageOptions {
    inline: boolean;
    allowBase64: boolean;
    HTMLAttributes: Record<string, string>;
}
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        customImage: {
            /**
             * Add an image
             */
            setImage: (options: {
                src: string;
                alt?: string;
                title?: string;
                height?: string;
                width?: string;
            }) => ReturnType;
        };
    }
}
export declare const ResizableImage: Node<ImageOptions, any>;
export {};
