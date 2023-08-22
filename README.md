# Habib-Shahzad/resizable-image-tiptap

[![Version](https://img.shields.io/github/package-json/v/habib-shahzad/resizable-image-tiptap)](https://github.com/Habib-Shahzad/resizable-image-tiptap)
[![License](https://img.shields.io/github/license/habib-shahzad/resizable-image-tiptap)](https://github.com/Habib-Shahzad/resizable-image-tiptap)

## Introduction

Tiptap is a suite of open source content editing and real-time collaboration tools for developers building apps like Notion or Google Docs.

## Installation

Install the package:

```shell
npm i tiptap-resize-image
```

#### Example:

```js
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ResizableImage } from "tiptap-resize-image";

const editor = useEditor(
  {
    extensions: [StarterKit, ResizableImage],
    content: `<img src="https://images.unsplash.com/photo-1579353977828-2a4eab540b9a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1674&q=80" /> height="200" `,
  },
  [subSection]
);
```
