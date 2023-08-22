# Habib-Shahzad/tiptap-resizable-image

[![Version](https://img.shields.io/github/package-json/v/habib-shahzad/tiptap-resizable-image)](https://github.com/Habib-Shahzad/tiptap-resizable-image)
[![License](https://img.shields.io/github/license/habib-shahzad/tiptap-resizable-image)](https://github.com/Habib-Shahzad/tiptap-resizable-image)

## Introduction

[Tiptap](https://tiptap.dev/) is a suite of open source content editing and real-time collaboration tools for developers building apps like Notion or Google Docs.

My implementation leverages the react [re-resizable](https://www.npmjs.com/package/re-resizable) library for image resizing functionality. The wrapper also integrates arrow buttons that facilitate margin adjustments within the rich text editor.

The [re-resizable](https://www.npmjs.com/package/re-resizable) library enables the creation of resizable components in React applications. It provides a straightforward way to make UI elements, such as images, resizable by dragging their edges. This is achieved through the utilization of the <Resizable> component. The library also supports maintaining aspect ratios during resizing and defining maximum dimensions for responsive behavior.

Incorporating this library into the Tip Tap Rich Text Editor enhances its capabilities by allowing users to easily resize images within the editor's content. The added arrow buttons further enhance the user experience by providing a simple way to adjust margins associated with the resized images. This combination of features improves the overall usability and versatility of the Rich Text Editor.


## Installation

Install the package:

```shell
npm i tiptap-resize-image
```

#### Example Usage:

```js
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ResizableImage } from "tiptap-resize-image";

const editor = useEditor(
  {
    extensions: [StarterKit, ResizableImage],
    content: `<img src="https://images.unsplash.com/photo-1579353977828-2a4eab540b9a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1674&q=80" /> height="200" `,
  },
  []
);
```
