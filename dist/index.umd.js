(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('@tiptap/pm/state'), require('@tiptap/pm/view'), require('@tiptap/pm/keymap'), require('@tiptap/pm/model'), require('@tiptap/pm/transform'), require('@tiptap/pm/commands'), require('@tiptap/pm/schema-list'), require('react-dom')) :
  typeof define === 'function' && define.amd ? define(['@tiptap/pm/state', '@tiptap/pm/view', '@tiptap/pm/keymap', '@tiptap/pm/model', '@tiptap/pm/transform', '@tiptap/pm/commands', '@tiptap/pm/schema-list', 'react-dom'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global["tiptap-resize-image"] = factory(global.state, null, null, global.model, global.transform, global.commands$1, global.schemaList, global.ReactDOM));
})(this, (function (state, view, keymap, model, transform, commands$1, schemaList, ReactDOM) { 'use strict';

  function createChainableState(config) {
      const { state, transaction } = config;
      let { selection } = transaction;
      let { doc } = transaction;
      let { storedMarks } = transaction;
      return {
          ...state,
          apply: state.apply.bind(state),
          applyTransaction: state.applyTransaction.bind(state),
          filterTransaction: state.filterTransaction,
          plugins: state.plugins,
          schema: state.schema,
          reconfigure: state.reconfigure.bind(state),
          toJSON: state.toJSON.bind(state),
          get storedMarks() {
              return storedMarks;
          },
          get selection() {
              return selection;
          },
          get doc() {
              return doc;
          },
          get tr() {
              selection = transaction.selection;
              doc = transaction.doc;
              storedMarks = transaction.storedMarks;
              return transaction;
          },
      };
  }

  class CommandManager {
      constructor(props) {
          this.editor = props.editor;
          this.rawCommands = this.editor.extensionManager.commands;
          this.customState = props.state;
      }
      get hasCustomState() {
          return !!this.customState;
      }
      get state() {
          return this.customState || this.editor.state;
      }
      get commands() {
          const { rawCommands, editor, state } = this;
          const { view } = editor;
          const { tr } = state;
          const props = this.buildProps(tr);
          return Object.fromEntries(Object.entries(rawCommands).map(([name, command]) => {
              const method = (...args) => {
                  const callback = command(...args)(props);
                  if (!tr.getMeta('preventDispatch') && !this.hasCustomState) {
                      view.dispatch(tr);
                  }
                  return callback;
              };
              return [name, method];
          }));
      }
      get chain() {
          return () => this.createChain();
      }
      get can() {
          return () => this.createCan();
      }
      createChain(startTr, shouldDispatch = true) {
          const { rawCommands, editor, state } = this;
          const { view } = editor;
          const callbacks = [];
          const hasStartTransaction = !!startTr;
          const tr = startTr || state.tr;
          const run = () => {
              if (!hasStartTransaction
                  && shouldDispatch
                  && !tr.getMeta('preventDispatch')
                  && !this.hasCustomState) {
                  view.dispatch(tr);
              }
              return callbacks.every(callback => callback === true);
          };
          const chain = {
              ...Object.fromEntries(Object.entries(rawCommands).map(([name, command]) => {
                  const chainedCommand = (...args) => {
                      const props = this.buildProps(tr, shouldDispatch);
                      const callback = command(...args)(props);
                      callbacks.push(callback);
                      return chain;
                  };
                  return [name, chainedCommand];
              })),
              run,
          };
          return chain;
      }
      createCan(startTr) {
          const { rawCommands, state } = this;
          const dispatch = false;
          const tr = startTr || state.tr;
          const props = this.buildProps(tr, dispatch);
          const formattedCommands = Object.fromEntries(Object.entries(rawCommands).map(([name, command]) => {
              return [name, (...args) => command(...args)({ ...props, dispatch: undefined })];
          }));
          return {
              ...formattedCommands,
              chain: () => this.createChain(tr, dispatch),
          };
      }
      buildProps(tr, shouldDispatch = true) {
          const { rawCommands, editor, state } = this;
          const { view } = editor;
          const props = {
              tr,
              editor,
              view,
              state: createChainableState({
                  state,
                  transaction: tr,
              }),
              dispatch: shouldDispatch ? () => undefined : undefined,
              chain: () => this.createChain(tr, shouldDispatch),
              can: () => this.createCan(tr),
              get commands() {
                  return Object.fromEntries(Object.entries(rawCommands).map(([name, command]) => {
                      return [name, (...args) => command(...args)(props)];
                  }));
              },
          };
          return props;
      }
  }

  function getExtensionField(extension, field, context) {
      if (extension.config[field] === undefined && extension.parent) {
          return getExtensionField(extension.parent, field, context);
      }
      if (typeof extension.config[field] === 'function') {
          const value = extension.config[field].bind({
              ...context,
              parent: extension.parent
                  ? getExtensionField(extension.parent, field, context)
                  : null,
          });
          return value;
      }
      return extension.config[field];
  }

  function splitExtensions(extensions) {
      const baseExtensions = extensions.filter(extension => extension.type === 'extension');
      const nodeExtensions = extensions.filter(extension => extension.type === 'node');
      const markExtensions = extensions.filter(extension => extension.type === 'mark');
      return {
          baseExtensions,
          nodeExtensions,
          markExtensions,
      };
  }

  function getNodeType(nameOrType, schema) {
      if (typeof nameOrType === 'string') {
          if (!schema.nodes[nameOrType]) {
              throw Error(`There is no node type named '${nameOrType}'. Maybe you forgot to add the extension?`);
          }
          return schema.nodes[nameOrType];
      }
      return nameOrType;
  }

  function mergeAttributes(...objects) {
      return objects
          .filter(item => !!item)
          .reduce((items, item) => {
          const mergedAttributes = { ...items };
          Object.entries(item).forEach(([key, value]) => {
              const exists = mergedAttributes[key];
              if (!exists) {
                  mergedAttributes[key] = value;
                  return;
              }
              if (key === 'class') {
                  const valueClasses = value ? value.split(' ') : [];
                  const existingClasses = mergedAttributes[key] ? mergedAttributes[key].split(' ') : [];
                  const insertClasses = valueClasses.filter(valueClass => !existingClasses.includes(valueClass));
                  mergedAttributes[key] = [...existingClasses, ...insertClasses].join(' ');
              }
              else if (key === 'style') {
                  mergedAttributes[key] = [mergedAttributes[key], value].join('; ');
              }
              else {
                  mergedAttributes[key] = value;
              }
          });
          return mergedAttributes;
      }, {});
  }

  function isFunction(value) {
      return typeof value === 'function';
  }

  /**
   * Optionally calls `value` as a function.
   * Otherwise it is returned directly.
   * @param value Function or any value.
   * @param context Optional context to bind to function.
   * @param props Optional props to pass to function.
   */
  function callOrReturn(value, context = undefined, ...props) {
      if (isFunction(value)) {
          if (context) {
              return value.bind(context)(...props);
          }
          return value(...props);
      }
      return value;
  }

  function isRegExp(value) {
      return Object.prototype.toString.call(value) === '[object RegExp]';
  }

  class InputRule {
      constructor(config) {
          this.find = config.find;
          this.handler = config.handler;
      }
  }

  // see: https://github.com/mesqueeb/is-what/blob/88d6e4ca92fb2baab6003c54e02eedf4e729e5ab/src/index.ts
  function getType(value) {
      return Object.prototype.toString.call(value).slice(8, -1);
  }
  function isPlainObject(value) {
      if (getType(value) !== 'Object') {
          return false;
      }
      return value.constructor === Object && Object.getPrototypeOf(value) === Object.prototype;
  }

  function mergeDeep(target, source) {
      const output = { ...target };
      if (isPlainObject(target) && isPlainObject(source)) {
          Object.keys(source).forEach(key => {
              if (isPlainObject(source[key])) {
                  if (!(key in target)) {
                      Object.assign(output, { [key]: source[key] });
                  }
                  else {
                      output[key] = mergeDeep(target[key], source[key]);
                  }
              }
              else {
                  Object.assign(output, { [key]: source[key] });
              }
          });
      }
      return output;
  }

  class Extension {
      constructor(config = {}) {
          this.type = 'extension';
          this.name = 'extension';
          this.parent = null;
          this.child = null;
          this.config = {
              name: this.name,
              defaultOptions: {},
          };
          this.config = {
              ...this.config,
              ...config,
          };
          this.name = this.config.name;
          if (config.defaultOptions) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${this.name}".`);
          }
          // TODO: remove `addOptions` fallback
          this.options = this.config.defaultOptions;
          if (this.config.addOptions) {
              this.options = callOrReturn(getExtensionField(this, 'addOptions', {
                  name: this.name,
              }));
          }
          this.storage = callOrReturn(getExtensionField(this, 'addStorage', {
              name: this.name,
              options: this.options,
          })) || {};
      }
      static create(config = {}) {
          return new Extension(config);
      }
      configure(options = {}) {
          // return a new instance so we can use the same extension
          // with different calls of `configure`
          const extension = this.extend();
          extension.options = mergeDeep(this.options, options);
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
      extend(extendedConfig = {}) {
          const extension = new Extension(extendedConfig);
          extension.parent = this;
          this.child = extension;
          extension.name = extendedConfig.name ? extendedConfig.name : extension.parent.name;
          if (extendedConfig.defaultOptions) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${extension.name}".`);
          }
          extension.options = callOrReturn(getExtensionField(extension, 'addOptions', {
              name: extension.name,
          }));
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
  }

  function getTextBetween(startNode, range, options) {
      const { from, to } = range;
      const { blockSeparator = '\n\n', textSerializers = {} } = options || {};
      let text = '';
      let separated = true;
      startNode.nodesBetween(from, to, (node, pos, parent, index) => {
          var _a;
          const textSerializer = textSerializers === null || textSerializers === void 0 ? void 0 : textSerializers[node.type.name];
          if (textSerializer) {
              if (node.isBlock && !separated) {
                  text += blockSeparator;
                  separated = true;
              }
              if (parent) {
                  text += textSerializer({
                      node,
                      pos,
                      parent,
                      index,
                      range,
                  });
              }
          }
          else if (node.isText) {
              text += (_a = node === null || node === void 0 ? void 0 : node.text) === null || _a === void 0 ? void 0 : _a.slice(Math.max(from, pos) - pos, to - pos); // eslint-disable-line
              separated = false;
          }
          else if (node.isBlock && !separated) {
              text += blockSeparator;
              separated = true;
          }
      });
      return text;
  }

  function getTextSerializersFromSchema(schema) {
      return Object.fromEntries(Object.entries(schema.nodes)
          .filter(([, node]) => node.spec.toText)
          .map(([name, node]) => [name, node.spec.toText]));
  }

  Extension.create({
      name: 'clipboardTextSerializer',
      addProseMirrorPlugins() {
          return [
              new state.Plugin({
                  key: new state.PluginKey('clipboardTextSerializer'),
                  props: {
                      clipboardTextSerializer: () => {
                          const { editor } = this;
                          const { state, schema } = editor;
                          const { doc, selection } = state;
                          const { ranges } = selection;
                          const from = Math.min(...ranges.map(range => range.$from.pos));
                          const to = Math.max(...ranges.map(range => range.$to.pos));
                          const textSerializers = getTextSerializersFromSchema(schema);
                          const range = { from, to };
                          return getTextBetween(doc, range, {
                              textSerializers,
                          });
                      },
                  },
              }),
          ];
      },
  });

  const blur = () => ({ editor, view }) => {
      requestAnimationFrame(() => {
          var _a;
          if (!editor.isDestroyed) {
              view.dom.blur();
              // Browsers should remove the caret on blur but safari does not.
              // See: https://github.com/ueberdosis/tiptap/issues/2405
              (_a = window === null || window === void 0 ? void 0 : window.getSelection()) === null || _a === void 0 ? void 0 : _a.removeAllRanges();
          }
      });
      return true;
  };

  const clearContent = (emitUpdate = false) => ({ commands }) => {
      return commands.setContent('', emitUpdate);
  };

  const clearNodes = () => ({ state, tr, dispatch }) => {
      const { selection } = tr;
      const { ranges } = selection;
      if (!dispatch) {
          return true;
      }
      ranges.forEach(({ $from, $to }) => {
          state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
              if (node.type.isText) {
                  return;
              }
              const { doc, mapping } = tr;
              const $mappedFrom = doc.resolve(mapping.map(pos));
              const $mappedTo = doc.resolve(mapping.map(pos + node.nodeSize));
              const nodeRange = $mappedFrom.blockRange($mappedTo);
              if (!nodeRange) {
                  return;
              }
              const targetLiftDepth = transform.liftTarget(nodeRange);
              if (node.type.isTextblock) {
                  const { defaultType } = $mappedFrom.parent.contentMatchAt($mappedFrom.index());
                  tr.setNodeMarkup(nodeRange.start, defaultType);
              }
              if (targetLiftDepth || targetLiftDepth === 0) {
                  tr.lift(nodeRange, targetLiftDepth);
              }
          });
      });
      return true;
  };

  const command = fn => props => {
      return fn(props);
  };

  const createParagraphNear = () => ({ state, dispatch }) => {
      return commands$1.createParagraphNear(state, dispatch);
  };

  const cut = (originRange, targetPos) => ({ editor, tr }) => {
      const { state: state$1 } = editor;
      const contentSlice = state$1.doc.slice(originRange.from, originRange.to);
      tr.deleteRange(originRange.from, originRange.to);
      const newPos = tr.mapping.map(targetPos);
      tr.insert(newPos, contentSlice.content);
      tr.setSelection(new state.TextSelection(tr.doc.resolve(newPos - 1)));
      return true;
  };

  const deleteCurrentNode = () => ({ tr, dispatch }) => {
      const { selection } = tr;
      const currentNode = selection.$anchor.node();
      // if there is content inside the current node, break out of this command
      if (currentNode.content.size > 0) {
          return false;
      }
      const $pos = tr.selection.$anchor;
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
          const node = $pos.node(depth);
          if (node.type === currentNode.type) {
              if (dispatch) {
                  const from = $pos.before(depth);
                  const to = $pos.after(depth);
                  tr.delete(from, to).scrollIntoView();
              }
              return true;
          }
      }
      return false;
  };

  const deleteNode = typeOrName => ({ tr, state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      const $pos = tr.selection.$anchor;
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
          const node = $pos.node(depth);
          if (node.type === type) {
              if (dispatch) {
                  const from = $pos.before(depth);
                  const to = $pos.after(depth);
                  tr.delete(from, to).scrollIntoView();
              }
              return true;
          }
      }
      return false;
  };

  const deleteRange = range => ({ tr, dispatch }) => {
      const { from, to } = range;
      if (dispatch) {
          tr.delete(from, to);
      }
      return true;
  };

  const deleteSelection = () => ({ state, dispatch }) => {
      return commands$1.deleteSelection(state, dispatch);
  };

  const enter = () => ({ commands }) => {
      return commands.keyboardShortcut('Enter');
  };

  const exitCode = () => ({ state, dispatch }) => {
      return commands$1.exitCode(state, dispatch);
  };

  /**
   * Check if object1 includes object2
   * @param object1 Object
   * @param object2 Object
   */
  function objectIncludes(object1, object2, options = { strict: true }) {
      const keys = Object.keys(object2);
      if (!keys.length) {
          return true;
      }
      return keys.every(key => {
          if (options.strict) {
              return object2[key] === object1[key];
          }
          if (isRegExp(object2[key])) {
              return object2[key].test(object1[key]);
          }
          return object2[key] === object1[key];
      });
  }

  function findMarkInSet(marks, type, attributes = {}) {
      return marks.find(item => {
          return item.type === type && objectIncludes(item.attrs, attributes);
      });
  }
  function isMarkInSet(marks, type, attributes = {}) {
      return !!findMarkInSet(marks, type, attributes);
  }
  function getMarkRange($pos, type, attributes = {}) {
      if (!$pos || !type) {
          return;
      }
      let start = $pos.parent.childAfter($pos.parentOffset);
      if ($pos.parentOffset === start.offset && start.offset !== 0) {
          start = $pos.parent.childBefore($pos.parentOffset);
      }
      if (!start.node) {
          return;
      }
      const mark = findMarkInSet([...start.node.marks], type, attributes);
      if (!mark) {
          return;
      }
      let startIndex = start.index;
      let startPos = $pos.start() + start.offset;
      let endIndex = startIndex + 1;
      let endPos = startPos + start.node.nodeSize;
      findMarkInSet([...start.node.marks], type, attributes);
      while (startIndex > 0 && mark.isInSet($pos.parent.child(startIndex - 1).marks)) {
          startIndex -= 1;
          startPos -= $pos.parent.child(startIndex).nodeSize;
      }
      while (endIndex < $pos.parent.childCount
          && isMarkInSet([...$pos.parent.child(endIndex).marks], type, attributes)) {
          endPos += $pos.parent.child(endIndex).nodeSize;
          endIndex += 1;
      }
      return {
          from: startPos,
          to: endPos,
      };
  }

  function getMarkType(nameOrType, schema) {
      if (typeof nameOrType === 'string') {
          if (!schema.marks[nameOrType]) {
              throw Error(`There is no mark type named '${nameOrType}'. Maybe you forgot to add the extension?`);
          }
          return schema.marks[nameOrType];
      }
      return nameOrType;
  }

  const extendMarkRange = (typeOrName, attributes = {}) => ({ tr, state: state$1, dispatch }) => {
      const type = getMarkType(typeOrName, state$1.schema);
      const { doc, selection } = tr;
      const { $from, from, to } = selection;
      if (dispatch) {
          const range = getMarkRange($from, type, attributes);
          if (range && range.from <= from && range.to >= to) {
              const newSelection = state.TextSelection.create(doc, range.from, range.to);
              tr.setSelection(newSelection);
          }
      }
      return true;
  };

  const first = commands => props => {
      const items = typeof commands === 'function'
          ? commands(props)
          : commands;
      for (let i = 0; i < items.length; i += 1) {
          if (items[i](props)) {
              return true;
          }
      }
      return false;
  };

  function isTextSelection(value) {
      return value instanceof state.TextSelection;
  }

  function minMax(value = 0, min = 0, max = 0) {
      return Math.min(Math.max(value, min), max);
  }

  function resolveFocusPosition(doc, position = null) {
      if (!position) {
          return null;
      }
      const selectionAtStart = state.Selection.atStart(doc);
      const selectionAtEnd = state.Selection.atEnd(doc);
      if (position === 'start' || position === true) {
          return selectionAtStart;
      }
      if (position === 'end') {
          return selectionAtEnd;
      }
      const minPos = selectionAtStart.from;
      const maxPos = selectionAtEnd.to;
      if (position === 'all') {
          return state.TextSelection.create(doc, minMax(0, minPos, maxPos), minMax(doc.content.size, minPos, maxPos));
      }
      return state.TextSelection.create(doc, minMax(position, minPos, maxPos), minMax(position, minPos, maxPos));
  }

  function isiOS() {
      return [
          'iPad Simulator',
          'iPhone Simulator',
          'iPod Simulator',
          'iPad',
          'iPhone',
          'iPod',
      ].includes(navigator.platform)
          // iPad on iOS 13 detection
          || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
  }

  const focus = (position = null, options = {}) => ({ editor, view, tr, dispatch, }) => {
      options = {
          scrollIntoView: true,
          ...options,
      };
      const delayedFocus = () => {
          // focus within `requestAnimationFrame` breaks focus on iOS
          // so we have to call this
          if (isiOS()) {
              view.dom.focus();
          }
          // For React we have to focus asynchronously. Otherwise wild things happen.
          // see: https://github.com/ueberdosis/tiptap/issues/1520
          requestAnimationFrame(() => {
              if (!editor.isDestroyed) {
                  view.focus();
                  if (options === null || options === void 0 ? void 0 : options.scrollIntoView) {
                      editor.commands.scrollIntoView();
                  }
              }
          });
      };
      if ((view.hasFocus() && position === null) || position === false) {
          return true;
      }
      // we don’t try to resolve a NodeSelection or CellSelection
      if (dispatch && position === null && !isTextSelection(editor.state.selection)) {
          delayedFocus();
          return true;
      }
      // pass through tr.doc instead of editor.state.doc
      // since transactions could change the editors state before this command has been run
      const selection = resolveFocusPosition(tr.doc, position) || editor.state.selection;
      const isSameSelection = editor.state.selection.eq(selection);
      if (dispatch) {
          if (!isSameSelection) {
              tr.setSelection(selection);
          }
          // `tr.setSelection` resets the stored marks
          // so we’ll restore them if the selection is the same as before
          if (isSameSelection && tr.storedMarks) {
              tr.setStoredMarks(tr.storedMarks);
          }
          delayedFocus();
      }
      return true;
  };

  const forEach = (items, fn) => props => {
      return items.every((item, index) => fn(item, { ...props, index }));
  };

  const insertContent = (value, options) => ({ tr, commands }) => {
      return commands.insertContentAt({ from: tr.selection.from, to: tr.selection.to }, value, options);
  };

  function elementFromString(value) {
      // add a wrapper to preserve leading and trailing whitespace
      const wrappedValue = `<body>${value}</body>`;
      return new window.DOMParser().parseFromString(wrappedValue, 'text/html').body;
  }

  function createNodeFromContent(content, schema, options) {
      options = {
          slice: true,
          parseOptions: {},
          ...options,
      };
      if (typeof content === 'object' && content !== null) {
          try {
              if (Array.isArray(content) && content.length > 0) {
                  return model.Fragment.fromArray(content.map(item => schema.nodeFromJSON(item)));
              }
              return schema.nodeFromJSON(content);
          }
          catch (error) {
              console.warn('[tiptap warn]: Invalid content.', 'Passed value:', content, 'Error:', error);
              return createNodeFromContent('', schema, options);
          }
      }
      if (typeof content === 'string') {
          const parser = model.DOMParser.fromSchema(schema);
          return options.slice
              ? parser.parseSlice(elementFromString(content), options.parseOptions).content
              : parser.parse(elementFromString(content), options.parseOptions);
      }
      return createNodeFromContent('', schema, options);
  }

  // source: https://github.com/ProseMirror/prosemirror-state/blob/master/src/selection.js#L466
  function selectionToInsertionEnd(tr, startLen, bias) {
      const last = tr.steps.length - 1;
      if (last < startLen) {
          return;
      }
      const step = tr.steps[last];
      if (!(step instanceof transform.ReplaceStep || step instanceof transform.ReplaceAroundStep)) {
          return;
      }
      const map = tr.mapping.maps[last];
      let end = 0;
      map.forEach((_from, _to, _newFrom, newTo) => {
          if (end === 0) {
              end = newTo;
          }
      });
      tr.setSelection(state.Selection.near(tr.doc.resolve(end), bias));
  }

  const isFragment = (nodeOrFragment) => {
      return nodeOrFragment.toString().startsWith('<');
  };
  const insertContentAt = (position, value, options) => ({ tr, dispatch, editor }) => {
      if (dispatch) {
          options = {
              parseOptions: {},
              updateSelection: true,
              ...options,
          };
          const content = createNodeFromContent(value, editor.schema, {
              parseOptions: {
                  preserveWhitespace: 'full',
                  ...options.parseOptions,
              },
          });
          // don’t dispatch an empty fragment because this can lead to strange errors
          if (content.toString() === '<>') {
              return true;
          }
          let { from, to } = typeof position === 'number' ? { from: position, to: position } : { from: position.from, to: position.to };
          let isOnlyTextContent = true;
          let isOnlyBlockContent = true;
          const nodes = isFragment(content) ? content : [content];
          nodes.forEach(node => {
              // check if added node is valid
              node.check();
              isOnlyTextContent = isOnlyTextContent ? node.isText && node.marks.length === 0 : false;
              isOnlyBlockContent = isOnlyBlockContent ? node.isBlock : false;
          });
          // check if we can replace the wrapping node by
          // the newly inserted content
          // example:
          // replace an empty paragraph by an inserted image
          // instead of inserting the image below the paragraph
          if (from === to && isOnlyBlockContent) {
              const { parent } = tr.doc.resolve(from);
              const isEmptyTextBlock = parent.isTextblock && !parent.type.spec.code && !parent.childCount;
              if (isEmptyTextBlock) {
                  from -= 1;
                  to += 1;
              }
          }
          // if there is only plain text we have to use `insertText`
          // because this will keep the current marks
          if (isOnlyTextContent) {
              // if value is string, we can use it directly
              // otherwise if it is an array, we have to join it
              if (Array.isArray(value)) {
                  tr.insertText(value.map(v => v.text || '').join(''), from, to);
              }
              else if (typeof value === 'object' && !!value && !!value.text) {
                  tr.insertText(value.text, from, to);
              }
              else {
                  tr.insertText(value, from, to);
              }
          }
          else {
              tr.replaceWith(from, to, content);
          }
          // set cursor at end of inserted content
          if (options.updateSelection) {
              selectionToInsertionEnd(tr, tr.steps.length - 1, -1);
          }
      }
      return true;
  };

  const joinUp = () => ({ state, dispatch }) => {
      return commands$1.joinUp(state, dispatch);
  };
  const joinDown = () => ({ state, dispatch }) => {
      return commands$1.joinDown(state, dispatch);
  };
  const joinBackward = () => ({ state, dispatch }) => {
      return commands$1.joinBackward(state, dispatch);
  };
  const joinForward = () => ({ state, dispatch }) => {
      return commands$1.joinForward(state, dispatch);
  };

  const joinItemBackward = () => ({ tr, state, dispatch, }) => {
      try {
          const point = transform.joinPoint(state.doc, state.selection.$from.pos, -1);
          if (point === null || point === undefined) {
              return false;
          }
          tr.join(point, 2);
          if (dispatch) {
              dispatch(tr);
          }
          return true;
      }
      catch {
          return false;
      }
  };

  const joinItemForward = () => ({ state, dispatch, tr, }) => {
      try {
          const point = transform.joinPoint(state.doc, state.selection.$from.pos, +1);
          if (point === null || point === undefined) {
              return false;
          }
          tr.join(point, 2);
          if (dispatch) {
              dispatch(tr);
          }
          return true;
      }
      catch (e) {
          return false;
      }
  };

  function isMacOS() {
      return typeof navigator !== 'undefined'
          ? /Mac/.test(navigator.platform)
          : false;
  }

  function normalizeKeyName(name) {
      const parts = name.split(/-(?!$)/);
      let result = parts[parts.length - 1];
      if (result === 'Space') {
          result = ' ';
      }
      let alt;
      let ctrl;
      let shift;
      let meta;
      for (let i = 0; i < parts.length - 1; i += 1) {
          const mod = parts[i];
          if (/^(cmd|meta|m)$/i.test(mod)) {
              meta = true;
          }
          else if (/^a(lt)?$/i.test(mod)) {
              alt = true;
          }
          else if (/^(c|ctrl|control)$/i.test(mod)) {
              ctrl = true;
          }
          else if (/^s(hift)?$/i.test(mod)) {
              shift = true;
          }
          else if (/^mod$/i.test(mod)) {
              if (isiOS() || isMacOS()) {
                  meta = true;
              }
              else {
                  ctrl = true;
              }
          }
          else {
              throw new Error(`Unrecognized modifier name: ${mod}`);
          }
      }
      if (alt) {
          result = `Alt-${result}`;
      }
      if (ctrl) {
          result = `Ctrl-${result}`;
      }
      if (meta) {
          result = `Meta-${result}`;
      }
      if (shift) {
          result = `Shift-${result}`;
      }
      return result;
  }
  const keyboardShortcut = name => ({ editor, view, tr, dispatch, }) => {
      const keys = normalizeKeyName(name).split(/-(?!$)/);
      const key = keys.find(item => !['Alt', 'Ctrl', 'Meta', 'Shift'].includes(item));
      const event = new KeyboardEvent('keydown', {
          key: key === 'Space'
              ? ' '
              : key,
          altKey: keys.includes('Alt'),
          ctrlKey: keys.includes('Ctrl'),
          metaKey: keys.includes('Meta'),
          shiftKey: keys.includes('Shift'),
          bubbles: true,
          cancelable: true,
      });
      const capturedTransaction = editor.captureTransaction(() => {
          view.someProp('handleKeyDown', f => f(view, event));
      });
      capturedTransaction === null || capturedTransaction === void 0 ? void 0 : capturedTransaction.steps.forEach(step => {
          const newStep = step.map(tr.mapping);
          if (newStep && dispatch) {
              tr.maybeStep(newStep);
          }
      });
      return true;
  };

  function isNodeActive(state, typeOrName, attributes = {}) {
      const { from, to, empty } = state.selection;
      const type = typeOrName ? getNodeType(typeOrName, state.schema) : null;
      const nodeRanges = [];
      state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.isText) {
              return;
          }
          const relativeFrom = Math.max(from, pos);
          const relativeTo = Math.min(to, pos + node.nodeSize);
          nodeRanges.push({
              node,
              from: relativeFrom,
              to: relativeTo,
          });
      });
      const selectionRange = to - from;
      const matchedNodeRanges = nodeRanges
          .filter(nodeRange => {
          if (!type) {
              return true;
          }
          return type.name === nodeRange.node.type.name;
      })
          .filter(nodeRange => objectIncludes(nodeRange.node.attrs, attributes, { strict: false }));
      if (empty) {
          return !!matchedNodeRanges.length;
      }
      const range = matchedNodeRanges.reduce((sum, nodeRange) => sum + nodeRange.to - nodeRange.from, 0);
      return range >= selectionRange;
  }

  const lift = (typeOrName, attributes = {}) => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      const isActive = isNodeActive(state, type, attributes);
      if (!isActive) {
          return false;
      }
      return commands$1.lift(state, dispatch);
  };

  const liftEmptyBlock = () => ({ state, dispatch }) => {
      return commands$1.liftEmptyBlock(state, dispatch);
  };

  const liftListItem = typeOrName => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      return schemaList.liftListItem(type)(state, dispatch);
  };

  const newlineInCode = () => ({ state, dispatch }) => {
      return commands$1.newlineInCode(state, dispatch);
  };

  function getSchemaTypeNameByName(name, schema) {
      if (schema.nodes[name]) {
          return 'node';
      }
      if (schema.marks[name]) {
          return 'mark';
      }
      return null;
  }

  /**
   * Remove a property or an array of properties from an object
   * @param obj Object
   * @param key Key to remove
   */
  function deleteProps(obj, propOrProps) {
      const props = typeof propOrProps === 'string'
          ? [propOrProps]
          : propOrProps;
      return Object
          .keys(obj)
          .reduce((newObj, prop) => {
          if (!props.includes(prop)) {
              newObj[prop] = obj[prop];
          }
          return newObj;
      }, {});
  }

  const resetAttributes = (typeOrName, attributes) => ({ tr, state, dispatch }) => {
      let nodeType = null;
      let markType = null;
      const schemaType = getSchemaTypeNameByName(typeof typeOrName === 'string' ? typeOrName : typeOrName.name, state.schema);
      if (!schemaType) {
          return false;
      }
      if (schemaType === 'node') {
          nodeType = getNodeType(typeOrName, state.schema);
      }
      if (schemaType === 'mark') {
          markType = getMarkType(typeOrName, state.schema);
      }
      if (dispatch) {
          tr.selection.ranges.forEach(range => {
              state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
                  if (nodeType && nodeType === node.type) {
                      tr.setNodeMarkup(pos, undefined, deleteProps(node.attrs, attributes));
                  }
                  if (markType && node.marks.length) {
                      node.marks.forEach(mark => {
                          if (markType === mark.type) {
                              tr.addMark(pos, pos + node.nodeSize, markType.create(deleteProps(mark.attrs, attributes)));
                          }
                      });
                  }
              });
          });
      }
      return true;
  };

  const scrollIntoView = () => ({ tr, dispatch }) => {
      if (dispatch) {
          tr.scrollIntoView();
      }
      return true;
  };

  const selectAll = () => ({ tr, commands }) => {
      return commands.setTextSelection({
          from: 0,
          to: tr.doc.content.size,
      });
  };

  const selectNodeBackward = () => ({ state, dispatch }) => {
      return commands$1.selectNodeBackward(state, dispatch);
  };

  const selectNodeForward = () => ({ state, dispatch }) => {
      return commands$1.selectNodeForward(state, dispatch);
  };

  const selectParentNode = () => ({ state, dispatch }) => {
      return commands$1.selectParentNode(state, dispatch);
  };

  // @ts-ignore
  const selectTextblockEnd = () => ({ state, dispatch }) => {
      return commands$1.selectTextblockEnd(state, dispatch);
  };

  // @ts-ignore
  const selectTextblockStart = () => ({ state, dispatch }) => {
      return commands$1.selectTextblockStart(state, dispatch);
  };

  function createDocument(content, schema, parseOptions = {}) {
      return createNodeFromContent(content, schema, { slice: false, parseOptions });
  }

  const setContent = (content, emitUpdate = false, parseOptions = {}) => ({ tr, editor, dispatch }) => {
      const { doc } = tr;
      const document = createDocument(content, editor.schema, parseOptions);
      if (dispatch) {
          tr.replaceWith(0, doc.content.size, document).setMeta('preventUpdate', !emitUpdate);
      }
      return true;
  };

  function getMarkAttributes(state, typeOrName) {
      const type = getMarkType(typeOrName, state.schema);
      const { from, to, empty } = state.selection;
      const marks = [];
      if (empty) {
          if (state.storedMarks) {
              marks.push(...state.storedMarks);
          }
          marks.push(...state.selection.$head.marks());
      }
      else {
          state.doc.nodesBetween(from, to, node => {
              marks.push(...node.marks);
          });
      }
      const mark = marks.find(markItem => markItem.type.name === type.name);
      if (!mark) {
          return {};
      }
      return { ...mark.attrs };
  }

  function defaultBlockAt(match) {
      for (let i = 0; i < match.edgeCount; i += 1) {
          const { type } = match.edge(i);
          if (type.isTextblock && !type.hasRequiredAttrs()) {
              return type;
          }
      }
      return null;
  }

  function findParentNodeClosestToPos($pos, predicate) {
      for (let i = $pos.depth; i > 0; i -= 1) {
          const node = $pos.node(i);
          if (predicate(node)) {
              return {
                  pos: i > 0 ? $pos.before(i) : 0,
                  start: $pos.start(i),
                  depth: i,
                  node,
              };
          }
      }
  }

  function findParentNode(predicate) {
      return (selection) => findParentNodeClosestToPos(selection.$from, predicate);
  }

  function getSplittedAttributes(extensionAttributes, typeName, attributes) {
      return Object.fromEntries(Object
          .entries(attributes)
          .filter(([name]) => {
          const extensionAttribute = extensionAttributes.find(item => {
              return item.type === typeName && item.name === name;
          });
          if (!extensionAttribute) {
              return false;
          }
          return extensionAttribute.attribute.keepOnSplit;
      }));
  }

  function isMarkActive(state, typeOrName, attributes = {}) {
      const { empty, ranges } = state.selection;
      const type = typeOrName ? getMarkType(typeOrName, state.schema) : null;
      if (empty) {
          return !!(state.storedMarks || state.selection.$from.marks())
              .filter(mark => {
              if (!type) {
                  return true;
              }
              return type.name === mark.type.name;
          })
              .find(mark => objectIncludes(mark.attrs, attributes, { strict: false }));
      }
      let selectionRange = 0;
      const markRanges = [];
      ranges.forEach(({ $from, $to }) => {
          const from = $from.pos;
          const to = $to.pos;
          state.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText && !node.marks.length) {
                  return;
              }
              const relativeFrom = Math.max(from, pos);
              const relativeTo = Math.min(to, pos + node.nodeSize);
              const range = relativeTo - relativeFrom;
              selectionRange += range;
              markRanges.push(...node.marks.map(mark => ({
                  mark,
                  from: relativeFrom,
                  to: relativeTo,
              })));
          });
      });
      if (selectionRange === 0) {
          return false;
      }
      // calculate range of matched mark
      const matchedRange = markRanges
          .filter(markRange => {
          if (!type) {
              return true;
          }
          return type.name === markRange.mark.type.name;
      })
          .filter(markRange => objectIncludes(markRange.mark.attrs, attributes, { strict: false }))
          .reduce((sum, markRange) => sum + markRange.to - markRange.from, 0);
      // calculate range of marks that excludes the searched mark
      // for example `code` doesn’t allow any other marks
      const excludedRange = markRanges
          .filter(markRange => {
          if (!type) {
              return true;
          }
          return markRange.mark.type !== type && markRange.mark.type.excludes(type);
      })
          .reduce((sum, markRange) => sum + markRange.to - markRange.from, 0);
      // we only include the result of `excludedRange`
      // if there is a match at all
      const range = matchedRange > 0 ? matchedRange + excludedRange : matchedRange;
      return range >= selectionRange;
  }

  function isList(name, extensions) {
      const { nodeExtensions } = splitExtensions(extensions);
      const extension = nodeExtensions.find(item => item.name === name);
      if (!extension) {
          return false;
      }
      const context = {
          name: extension.name,
          options: extension.options,
          storage: extension.storage,
      };
      const group = callOrReturn(getExtensionField(extension, 'group', context));
      if (typeof group !== 'string') {
          return false;
      }
      return group.split(' ').includes('list');
  }

  function canSetMark(state, tr, newMarkType) {
      var _a;
      const { selection } = tr;
      let cursor = null;
      if (isTextSelection(selection)) {
          cursor = selection.$cursor;
      }
      if (cursor) {
          const currentMarks = (_a = state.storedMarks) !== null && _a !== void 0 ? _a : cursor.marks();
          // There can be no current marks that exclude the new mark
          return (!!newMarkType.isInSet(currentMarks)
              || !currentMarks.some(mark => mark.type.excludes(newMarkType)));
      }
      const { ranges } = selection;
      return ranges.some(({ $from, $to }) => {
          let someNodeSupportsMark = $from.depth === 0
              ? state.doc.inlineContent && state.doc.type.allowsMarkType(newMarkType)
              : false;
          state.doc.nodesBetween($from.pos, $to.pos, (node, _pos, parent) => {
              // If we already found a mark that we can enable, return false to bypass the remaining search
              if (someNodeSupportsMark) {
                  return false;
              }
              if (node.isInline) {
                  const parentAllowsMarkType = !parent || parent.type.allowsMarkType(newMarkType);
                  const currentMarksAllowMarkType = !!newMarkType.isInSet(node.marks)
                      || !node.marks.some(otherMark => otherMark.type.excludes(newMarkType));
                  someNodeSupportsMark = parentAllowsMarkType && currentMarksAllowMarkType;
              }
              return !someNodeSupportsMark;
          });
          return someNodeSupportsMark;
      });
  }
  const setMark = (typeOrName, attributes = {}) => ({ tr, state, dispatch }) => {
      const { selection } = tr;
      const { empty, ranges } = selection;
      const type = getMarkType(typeOrName, state.schema);
      if (dispatch) {
          if (empty) {
              const oldAttributes = getMarkAttributes(state, type);
              tr.addStoredMark(type.create({
                  ...oldAttributes,
                  ...attributes,
              }));
          }
          else {
              ranges.forEach(range => {
                  const from = range.$from.pos;
                  const to = range.$to.pos;
                  state.doc.nodesBetween(from, to, (node, pos) => {
                      const trimmedFrom = Math.max(pos, from);
                      const trimmedTo = Math.min(pos + node.nodeSize, to);
                      const someHasMark = node.marks.find(mark => mark.type === type);
                      // if there is already a mark of this type
                      // we know that we have to merge its attributes
                      // otherwise we add a fresh new mark
                      if (someHasMark) {
                          node.marks.forEach(mark => {
                              if (type === mark.type) {
                                  tr.addMark(trimmedFrom, trimmedTo, type.create({
                                      ...mark.attrs,
                                      ...attributes,
                                  }));
                              }
                          });
                      }
                      else {
                          tr.addMark(trimmedFrom, trimmedTo, type.create(attributes));
                      }
                  });
              });
          }
      }
      return canSetMark(state, tr, type);
  };

  const setMeta = (key, value) => ({ tr }) => {
      tr.setMeta(key, value);
      return true;
  };

  const setNode = (typeOrName, attributes = {}) => ({ state, dispatch, chain }) => {
      const type = getNodeType(typeOrName, state.schema);
      // TODO: use a fallback like insertContent?
      if (!type.isTextblock) {
          console.warn('[tiptap warn]: Currently "setNode()" only supports text block nodes.');
          return false;
      }
      return (chain()
          // try to convert node to default node if needed
          .command(({ commands }) => {
          const canSetBlock = commands$1.setBlockType(type, attributes)(state);
          if (canSetBlock) {
              return true;
          }
          return commands.clearNodes();
      })
          .command(({ state: updatedState }) => {
          return commands$1.setBlockType(type, attributes)(updatedState, dispatch);
      })
          .run());
  };

  const setNodeSelection = position => ({ tr, dispatch }) => {
      if (dispatch) {
          const { doc } = tr;
          const from = minMax(position, 0, doc.content.size);
          const selection = state.NodeSelection.create(doc, from);
          tr.setSelection(selection);
      }
      return true;
  };

  const setTextSelection = position => ({ tr, dispatch }) => {
      if (dispatch) {
          const { doc } = tr;
          const { from, to } = typeof position === 'number' ? { from: position, to: position } : position;
          const minPos = state.TextSelection.atStart(doc).from;
          const maxPos = state.TextSelection.atEnd(doc).to;
          const resolvedFrom = minMax(from, minPos, maxPos);
          const resolvedEnd = minMax(to, minPos, maxPos);
          const selection = state.TextSelection.create(doc, resolvedFrom, resolvedEnd);
          tr.setSelection(selection);
      }
      return true;
  };

  const sinkListItem = typeOrName => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      return schemaList.sinkListItem(type)(state, dispatch);
  };

  function ensureMarks(state, splittableMarks) {
      const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
      if (marks) {
          const filteredMarks = marks.filter(mark => splittableMarks === null || splittableMarks === void 0 ? void 0 : splittableMarks.includes(mark.type.name));
          state.tr.ensureMarks(filteredMarks);
      }
  }
  const splitBlock = ({ keepMarks = true } = {}) => ({ tr, state: state$1, dispatch, editor, }) => {
      const { selection, doc } = tr;
      const { $from, $to } = selection;
      const extensionAttributes = editor.extensionManager.attributes;
      const newAttributes = getSplittedAttributes(extensionAttributes, $from.node().type.name, $from.node().attrs);
      if (selection instanceof state.NodeSelection && selection.node.isBlock) {
          if (!$from.parentOffset || !transform.canSplit(doc, $from.pos)) {
              return false;
          }
          if (dispatch) {
              if (keepMarks) {
                  ensureMarks(state$1, editor.extensionManager.splittableMarks);
              }
              tr.split($from.pos).scrollIntoView();
          }
          return true;
      }
      if (!$from.parent.isBlock) {
          return false;
      }
      if (dispatch) {
          const atEnd = $to.parentOffset === $to.parent.content.size;
          if (selection instanceof state.TextSelection) {
              tr.deleteSelection();
          }
          const deflt = $from.depth === 0
              ? undefined
              : defaultBlockAt($from.node(-1).contentMatchAt($from.indexAfter(-1)));
          let types = atEnd && deflt
              ? [
                  {
                      type: deflt,
                      attrs: newAttributes,
                  },
              ]
              : undefined;
          let can = transform.canSplit(tr.doc, tr.mapping.map($from.pos), 1, types);
          if (!types
              && !can
              && transform.canSplit(tr.doc, tr.mapping.map($from.pos), 1, deflt ? [{ type: deflt }] : undefined)) {
              can = true;
              types = deflt
                  ? [
                      {
                          type: deflt,
                          attrs: newAttributes,
                      },
                  ]
                  : undefined;
          }
          if (can) {
              tr.split(tr.mapping.map($from.pos), 1, types);
              if (deflt && !atEnd && !$from.parentOffset && $from.parent.type !== deflt) {
                  const first = tr.mapping.map($from.before());
                  const $first = tr.doc.resolve(first);
                  if ($from.node(-1).canReplaceWith($first.index(), $first.index() + 1, deflt)) {
                      tr.setNodeMarkup(tr.mapping.map($from.before()), deflt);
                  }
              }
          }
          if (keepMarks) {
              ensureMarks(state$1, editor.extensionManager.splittableMarks);
          }
          tr.scrollIntoView();
      }
      return true;
  };

  const splitListItem = typeOrName => ({ tr, state: state$1, dispatch, editor, }) => {
      var _a;
      const type = getNodeType(typeOrName, state$1.schema);
      const { $from, $to } = state$1.selection;
      // @ts-ignore
      // eslint-disable-next-line
      const node = state$1.selection.node;
      if ((node && node.isBlock) || $from.depth < 2 || !$from.sameParent($to)) {
          return false;
      }
      const grandParent = $from.node(-1);
      if (grandParent.type !== type) {
          return false;
      }
      const extensionAttributes = editor.extensionManager.attributes;
      if ($from.parent.content.size === 0 && $from.node(-1).childCount === $from.indexAfter(-1)) {
          // In an empty block. If this is a nested list, the wrapping
          // list item should be split. Otherwise, bail out and let next
          // command handle lifting.
          if ($from.depth === 2
              || $from.node(-3).type !== type
              || $from.index(-2) !== $from.node(-2).childCount - 1) {
              return false;
          }
          if (dispatch) {
              let wrap = model.Fragment.empty;
              // eslint-disable-next-line
              const depthBefore = $from.index(-1) ? 1 : $from.index(-2) ? 2 : 3;
              // Build a fragment containing empty versions of the structure
              // from the outer list item to the parent node of the cursor
              for (let d = $from.depth - depthBefore; d >= $from.depth - 3; d -= 1) {
                  wrap = model.Fragment.from($from.node(d).copy(wrap));
              }
              // eslint-disable-next-line
              const depthAfter = $from.indexAfter(-1) < $from.node(-2).childCount ? 1 : $from.indexAfter(-2) < $from.node(-3).childCount ? 2 : 3;
              // Add a second list item with an empty default start node
              const newNextTypeAttributes = getSplittedAttributes(extensionAttributes, $from.node().type.name, $from.node().attrs);
              const nextType = ((_a = type.contentMatch.defaultType) === null || _a === void 0 ? void 0 : _a.createAndFill(newNextTypeAttributes)) || undefined;
              wrap = wrap.append(model.Fragment.from(type.createAndFill(null, nextType) || undefined));
              const start = $from.before($from.depth - (depthBefore - 1));
              tr.replace(start, $from.after(-depthAfter), new model.Slice(wrap, 4 - depthBefore, 0));
              let sel = -1;
              tr.doc.nodesBetween(start, tr.doc.content.size, (n, pos) => {
                  if (sel > -1) {
                      return false;
                  }
                  if (n.isTextblock && n.content.size === 0) {
                      sel = pos + 1;
                  }
              });
              if (sel > -1) {
                  tr.setSelection(state.TextSelection.near(tr.doc.resolve(sel)));
              }
              tr.scrollIntoView();
          }
          return true;
      }
      const nextType = $to.pos === $from.end() ? grandParent.contentMatchAt(0).defaultType : null;
      const newTypeAttributes = getSplittedAttributes(extensionAttributes, grandParent.type.name, grandParent.attrs);
      const newNextTypeAttributes = getSplittedAttributes(extensionAttributes, $from.node().type.name, $from.node().attrs);
      tr.delete($from.pos, $to.pos);
      const types = nextType
          ? [
              { type, attrs: newTypeAttributes },
              { type: nextType, attrs: newNextTypeAttributes },
          ]
          : [{ type, attrs: newTypeAttributes }];
      if (!transform.canSplit(tr.doc, $from.pos, 2)) {
          return false;
      }
      if (dispatch) {
          const { selection, storedMarks } = state$1;
          const { splittableMarks } = editor.extensionManager;
          const marks = storedMarks || (selection.$to.parentOffset && selection.$from.marks());
          tr.split($from.pos, 2, types).scrollIntoView();
          if (!marks || !dispatch) {
              return true;
          }
          const filteredMarks = marks.filter(mark => splittableMarks.includes(mark.type.name));
          tr.ensureMarks(filteredMarks);
      }
      return true;
  };

  const joinListBackwards = (tr, listType) => {
      const list = findParentNode(node => node.type === listType)(tr.selection);
      if (!list) {
          return true;
      }
      const before = tr.doc.resolve(Math.max(0, list.pos - 1)).before(list.depth);
      if (before === undefined) {
          return true;
      }
      const nodeBefore = tr.doc.nodeAt(before);
      const canJoinBackwards = list.node.type === (nodeBefore === null || nodeBefore === void 0 ? void 0 : nodeBefore.type) && transform.canJoin(tr.doc, list.pos);
      if (!canJoinBackwards) {
          return true;
      }
      tr.join(list.pos);
      return true;
  };
  const joinListForwards = (tr, listType) => {
      const list = findParentNode(node => node.type === listType)(tr.selection);
      if (!list) {
          return true;
      }
      const after = tr.doc.resolve(list.start).after(list.depth);
      if (after === undefined) {
          return true;
      }
      const nodeAfter = tr.doc.nodeAt(after);
      const canJoinForwards = list.node.type === (nodeAfter === null || nodeAfter === void 0 ? void 0 : nodeAfter.type) && transform.canJoin(tr.doc, after);
      if (!canJoinForwards) {
          return true;
      }
      tr.join(after);
      return true;
  };
  const toggleList = (listTypeOrName, itemTypeOrName, keepMarks, attributes = {}) => ({ editor, tr, state, dispatch, chain, commands, can, }) => {
      const { extensions, splittableMarks } = editor.extensionManager;
      const listType = getNodeType(listTypeOrName, state.schema);
      const itemType = getNodeType(itemTypeOrName, state.schema);
      const { selection, storedMarks } = state;
      const { $from, $to } = selection;
      const range = $from.blockRange($to);
      const marks = storedMarks || (selection.$to.parentOffset && selection.$from.marks());
      if (!range) {
          return false;
      }
      const parentList = findParentNode(node => isList(node.type.name, extensions))(selection);
      if (range.depth >= 1 && parentList && range.depth - parentList.depth <= 1) {
          // remove list
          if (parentList.node.type === listType) {
              return commands.liftListItem(itemType);
          }
          // change list type
          if (isList(parentList.node.type.name, extensions)
              && listType.validContent(parentList.node.content)
              && dispatch) {
              return chain()
                  .command(() => {
                  tr.setNodeMarkup(parentList.pos, listType);
                  return true;
              })
                  .command(() => joinListBackwards(tr, listType))
                  .command(() => joinListForwards(tr, listType))
                  .run();
          }
      }
      if (!keepMarks || !marks || !dispatch) {
          return chain()
              // try to convert node to default node if needed
              .command(() => {
              const canWrapInList = can().wrapInList(listType, attributes);
              if (canWrapInList) {
                  return true;
              }
              return commands.clearNodes();
          })
              .wrapInList(listType, attributes)
              .command(() => joinListBackwards(tr, listType))
              .command(() => joinListForwards(tr, listType))
              .run();
      }
      return (chain()
          // try to convert node to default node if needed
          .command(() => {
          const canWrapInList = can().wrapInList(listType, attributes);
          const filteredMarks = marks.filter(mark => splittableMarks.includes(mark.type.name));
          tr.ensureMarks(filteredMarks);
          if (canWrapInList) {
              return true;
          }
          return commands.clearNodes();
      })
          .wrapInList(listType, attributes)
          .command(() => joinListBackwards(tr, listType))
          .command(() => joinListForwards(tr, listType))
          .run());
  };

  const toggleMark = (typeOrName, attributes = {}, options = {}) => ({ state, commands }) => {
      const { extendEmptyMarkRange = false } = options;
      const type = getMarkType(typeOrName, state.schema);
      const isActive = isMarkActive(state, type, attributes);
      if (isActive) {
          return commands.unsetMark(type, { extendEmptyMarkRange });
      }
      return commands.setMark(type, attributes);
  };

  const toggleNode = (typeOrName, toggleTypeOrName, attributes = {}) => ({ state, commands }) => {
      const type = getNodeType(typeOrName, state.schema);
      const toggleType = getNodeType(toggleTypeOrName, state.schema);
      const isActive = isNodeActive(state, type, attributes);
      if (isActive) {
          return commands.setNode(toggleType);
      }
      return commands.setNode(type, attributes);
  };

  const toggleWrap = (typeOrName, attributes = {}) => ({ state, commands }) => {
      const type = getNodeType(typeOrName, state.schema);
      const isActive = isNodeActive(state, type, attributes);
      if (isActive) {
          return commands.lift(type);
      }
      return commands.wrapIn(type, attributes);
  };

  const undoInputRule = () => ({ state, dispatch }) => {
      const plugins = state.plugins;
      for (let i = 0; i < plugins.length; i += 1) {
          const plugin = plugins[i];
          let undoable;
          // @ts-ignore
          // eslint-disable-next-line
          if (plugin.spec.isInputRules && (undoable = plugin.getState(state))) {
              if (dispatch) {
                  const tr = state.tr;
                  const toUndo = undoable.transform;
                  for (let j = toUndo.steps.length - 1; j >= 0; j -= 1) {
                      tr.step(toUndo.steps[j].invert(toUndo.docs[j]));
                  }
                  if (undoable.text) {
                      const marks = tr.doc.resolve(undoable.from).marks();
                      tr.replaceWith(undoable.from, undoable.to, state.schema.text(undoable.text, marks));
                  }
                  else {
                      tr.delete(undoable.from, undoable.to);
                  }
              }
              return true;
          }
      }
      return false;
  };

  const unsetAllMarks = () => ({ tr, dispatch }) => {
      const { selection } = tr;
      const { empty, ranges } = selection;
      if (empty) {
          return true;
      }
      if (dispatch) {
          ranges.forEach(range => {
              tr.removeMark(range.$from.pos, range.$to.pos);
          });
      }
      return true;
  };

  const unsetMark = (typeOrName, options = {}) => ({ tr, state, dispatch }) => {
      var _a;
      const { extendEmptyMarkRange = false } = options;
      const { selection } = tr;
      const type = getMarkType(typeOrName, state.schema);
      const { $from, empty, ranges } = selection;
      if (!dispatch) {
          return true;
      }
      if (empty && extendEmptyMarkRange) {
          let { from, to } = selection;
          const attrs = (_a = $from.marks().find(mark => mark.type === type)) === null || _a === void 0 ? void 0 : _a.attrs;
          const range = getMarkRange($from, type, attrs);
          if (range) {
              from = range.from;
              to = range.to;
          }
          tr.removeMark(from, to, type);
      }
      else {
          ranges.forEach(range => {
              tr.removeMark(range.$from.pos, range.$to.pos, type);
          });
      }
      tr.removeStoredMark(type);
      return true;
  };

  const updateAttributes = (typeOrName, attributes = {}) => ({ tr, state, dispatch }) => {
      let nodeType = null;
      let markType = null;
      const schemaType = getSchemaTypeNameByName(typeof typeOrName === 'string' ? typeOrName : typeOrName.name, state.schema);
      if (!schemaType) {
          return false;
      }
      if (schemaType === 'node') {
          nodeType = getNodeType(typeOrName, state.schema);
      }
      if (schemaType === 'mark') {
          markType = getMarkType(typeOrName, state.schema);
      }
      if (dispatch) {
          tr.selection.ranges.forEach(range => {
              const from = range.$from.pos;
              const to = range.$to.pos;
              state.doc.nodesBetween(from, to, (node, pos) => {
                  if (nodeType && nodeType === node.type) {
                      tr.setNodeMarkup(pos, undefined, {
                          ...node.attrs,
                          ...attributes,
                      });
                  }
                  if (markType && node.marks.length) {
                      node.marks.forEach(mark => {
                          if (markType === mark.type) {
                              const trimmedFrom = Math.max(pos, from);
                              const trimmedTo = Math.min(pos + node.nodeSize, to);
                              tr.addMark(trimmedFrom, trimmedTo, markType.create({
                                  ...mark.attrs,
                                  ...attributes,
                              }));
                          }
                      });
                  }
              });
          });
      }
      return true;
  };

  const wrapIn = (typeOrName, attributes = {}) => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      return commands$1.wrapIn(type, attributes)(state, dispatch);
  };

  const wrapInList = (typeOrName, attributes = {}) => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      return schemaList.wrapInList(type, attributes)(state, dispatch);
  };

  var commands = /*#__PURE__*/Object.freeze({
    __proto__: null,
    blur: blur,
    clearContent: clearContent,
    clearNodes: clearNodes,
    command: command,
    createParagraphNear: createParagraphNear,
    cut: cut,
    deleteCurrentNode: deleteCurrentNode,
    deleteNode: deleteNode,
    deleteRange: deleteRange,
    deleteSelection: deleteSelection,
    enter: enter,
    exitCode: exitCode,
    extendMarkRange: extendMarkRange,
    first: first,
    focus: focus,
    forEach: forEach,
    insertContent: insertContent,
    insertContentAt: insertContentAt,
    joinUp: joinUp,
    joinDown: joinDown,
    joinBackward: joinBackward,
    joinForward: joinForward,
    joinItemBackward: joinItemBackward,
    joinItemForward: joinItemForward,
    keyboardShortcut: keyboardShortcut,
    lift: lift,
    liftEmptyBlock: liftEmptyBlock,
    liftListItem: liftListItem,
    newlineInCode: newlineInCode,
    resetAttributes: resetAttributes,
    scrollIntoView: scrollIntoView,
    selectAll: selectAll,
    selectNodeBackward: selectNodeBackward,
    selectNodeForward: selectNodeForward,
    selectParentNode: selectParentNode,
    selectTextblockEnd: selectTextblockEnd,
    selectTextblockStart: selectTextblockStart,
    setContent: setContent,
    setMark: setMark,
    setMeta: setMeta,
    setNode: setNode,
    setNodeSelection: setNodeSelection,
    setTextSelection: setTextSelection,
    sinkListItem: sinkListItem,
    splitBlock: splitBlock,
    splitListItem: splitListItem,
    toggleList: toggleList,
    toggleMark: toggleMark,
    toggleNode: toggleNode,
    toggleWrap: toggleWrap,
    undoInputRule: undoInputRule,
    unsetAllMarks: unsetAllMarks,
    unsetMark: unsetMark,
    updateAttributes: updateAttributes,
    wrapIn: wrapIn,
    wrapInList: wrapInList
  });

  Extension.create({
      name: 'commands',
      addCommands() {
          return {
              ...commands,
          };
      },
  });

  Extension.create({
      name: 'editable',
      addProseMirrorPlugins() {
          return [
              new state.Plugin({
                  key: new state.PluginKey('editable'),
                  props: {
                      editable: () => this.editor.options.editable,
                  },
              }),
          ];
      },
  });

  Extension.create({
      name: 'focusEvents',
      addProseMirrorPlugins() {
          const { editor } = this;
          return [
              new state.Plugin({
                  key: new state.PluginKey('focusEvents'),
                  props: {
                      handleDOMEvents: {
                          focus: (view, event) => {
                              editor.isFocused = true;
                              const transaction = editor.state.tr
                                  .setMeta('focus', { event })
                                  .setMeta('addToHistory', false);
                              view.dispatch(transaction);
                              return false;
                          },
                          blur: (view, event) => {
                              editor.isFocused = false;
                              const transaction = editor.state.tr
                                  .setMeta('blur', { event })
                                  .setMeta('addToHistory', false);
                              view.dispatch(transaction);
                              return false;
                          },
                      },
                  },
              }),
          ];
      },
  });

  Extension.create({
      name: 'keymap',
      addKeyboardShortcuts() {
          const handleBackspace = () => this.editor.commands.first(({ commands }) => [
              () => commands.undoInputRule(),
              // maybe convert first text block node to default node
              () => commands.command(({ tr }) => {
                  const { selection, doc } = tr;
                  const { empty, $anchor } = selection;
                  const { pos, parent } = $anchor;
                  const $parentPos = $anchor.parent.isTextblock ? tr.doc.resolve(pos - 1) : $anchor;
                  const parentIsIsolating = $parentPos.parent.type.spec.isolating;
                  const parentPos = $anchor.pos - $anchor.parentOffset;
                  const isAtStart = (parentIsIsolating && $parentPos.parent.childCount === 1)
                      ? parentPos === $anchor.pos
                      : state.Selection.atStart(doc).from === pos;
                  if (!empty || !isAtStart || !parent.type.isTextblock || parent.textContent.length) {
                      return false;
                  }
                  return commands.clearNodes();
              }),
              () => commands.deleteSelection(),
              () => commands.joinBackward(),
              () => commands.selectNodeBackward(),
          ]);
          const handleDelete = () => this.editor.commands.first(({ commands }) => [
              () => commands.deleteSelection(),
              () => commands.deleteCurrentNode(),
              () => commands.joinForward(),
              () => commands.selectNodeForward(),
          ]);
          const handleEnter = () => this.editor.commands.first(({ commands }) => [
              () => commands.newlineInCode(),
              () => commands.createParagraphNear(),
              () => commands.liftEmptyBlock(),
              () => commands.splitBlock(),
          ]);
          const baseKeymap = {
              Enter: handleEnter,
              'Mod-Enter': () => this.editor.commands.exitCode(),
              Backspace: handleBackspace,
              'Mod-Backspace': handleBackspace,
              'Shift-Backspace': handleBackspace,
              Delete: handleDelete,
              'Mod-Delete': handleDelete,
              'Mod-a': () => this.editor.commands.selectAll(),
          };
          const pcKeymap = {
              ...baseKeymap,
          };
          const macKeymap = {
              ...baseKeymap,
              'Ctrl-h': handleBackspace,
              'Alt-Backspace': handleBackspace,
              'Ctrl-d': handleDelete,
              'Ctrl-Alt-Backspace': handleDelete,
              'Alt-Delete': handleDelete,
              'Alt-d': handleDelete,
              'Ctrl-a': () => this.editor.commands.selectTextblockStart(),
              'Ctrl-e': () => this.editor.commands.selectTextblockEnd(),
          };
          if (isiOS() || isMacOS()) {
              return macKeymap;
          }
          return pcKeymap;
      },
      addProseMirrorPlugins() {
          return [
              // With this plugin we check if the whole document was selected and deleted.
              // In this case we will additionally call `clearNodes()` to convert e.g. a heading
              // to a paragraph if necessary.
              // This is an alternative to ProseMirror's `AllSelection`, which doesn’t work well
              // with many other commands.
              new state.Plugin({
                  key: new state.PluginKey('clearDocument'),
                  appendTransaction: (transactions, oldState, newState) => {
                      const docChanges = transactions.some(transaction => transaction.docChanged)
                          && !oldState.doc.eq(newState.doc);
                      if (!docChanges) {
                          return;
                      }
                      const { empty, from, to } = oldState.selection;
                      const allFrom = state.Selection.atStart(oldState.doc).from;
                      const allEnd = state.Selection.atEnd(oldState.doc).to;
                      const allWasSelected = from === allFrom && to === allEnd;
                      if (empty || !allWasSelected) {
                          return;
                      }
                      const isEmpty = newState.doc.textBetween(0, newState.doc.content.size, ' ', ' ').length === 0;
                      if (!isEmpty) {
                          return;
                      }
                      const tr = newState.tr;
                      const state$1 = createChainableState({
                          state: newState,
                          transaction: tr,
                      });
                      const { commands } = new CommandManager({
                          editor: this.editor,
                          state: state$1,
                      });
                      commands.clearNodes();
                      if (!tr.steps.length) {
                          return;
                      }
                      return tr;
                  },
              }),
          ];
      },
  });

  Extension.create({
      name: 'tabindex',
      addProseMirrorPlugins() {
          return [
              new state.Plugin({
                  key: new state.PluginKey('tabindex'),
                  props: {
                      attributes: this.editor.isEditable ? { tabindex: '0' } : {},
                  },
              }),
          ];
      },
  });

  /**
   * Build an input rule that adds a node when the
   * matched text is typed into it.
   */
  function nodeInputRule(config) {
      return new InputRule({
          find: config.find,
          handler: ({ state, range, match }) => {
              const attributes = callOrReturn(config.getAttributes, undefined, match) || {};
              const { tr } = state;
              const start = range.from;
              let end = range.to;
              const newNode = config.type.create(attributes);
              if (match[1]) {
                  const offset = match[0].lastIndexOf(match[1]);
                  let matchStart = start + offset;
                  if (matchStart > end) {
                      matchStart = end;
                  }
                  else {
                      end = matchStart + match[1].length;
                  }
                  // insert last typed character
                  const lastChar = match[0][match[0].length - 1];
                  tr.insertText(lastChar, start + match[0].length - 1);
                  // insert node from input rule
                  tr.replaceWith(matchStart, end, newNode);
              }
              else if (match[0]) {
                  tr.insert(start - 1, config.type.create(attributes)).delete(tr.mapping.map(start), tr.mapping.map(end));
              }
              tr.scrollIntoView();
          },
      });
  }

  class Node {
      constructor(config = {}) {
          this.type = 'node';
          this.name = 'node';
          this.parent = null;
          this.child = null;
          this.config = {
              name: this.name,
              defaultOptions: {},
          };
          this.config = {
              ...this.config,
              ...config,
          };
          this.name = this.config.name;
          if (config.defaultOptions) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${this.name}".`);
          }
          // TODO: remove `addOptions` fallback
          this.options = this.config.defaultOptions;
          if (this.config.addOptions) {
              this.options = callOrReturn(getExtensionField(this, 'addOptions', {
                  name: this.name,
              }));
          }
          this.storage = callOrReturn(getExtensionField(this, 'addStorage', {
              name: this.name,
              options: this.options,
          })) || {};
      }
      static create(config = {}) {
          return new Node(config);
      }
      configure(options = {}) {
          // return a new instance so we can use the same extension
          // with different calls of `configure`
          const extension = this.extend();
          extension.options = mergeDeep(this.options, options);
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
      extend(extendedConfig = {}) {
          const extension = new Node(extendedConfig);
          extension.parent = this;
          this.child = extension;
          extension.name = extendedConfig.name ? extendedConfig.name : extension.parent.name;
          if (extendedConfig.defaultOptions) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${extension.name}".`);
          }
          extension.options = callOrReturn(getExtensionField(extension, 'addOptions', {
              name: extension.name,
          }));
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
  }

  function isAndroid() {
      return navigator.platform === 'Android' || /android/i.test(navigator.userAgent);
  }

  class NodeView {
      constructor(component, props, options) {
          this.isDragging = false;
          this.component = component;
          this.editor = props.editor;
          this.options = {
              stopEvent: null,
              ignoreMutation: null,
              ...options,
          };
          this.extension = props.extension;
          this.node = props.node;
          this.decorations = props.decorations;
          this.getPos = props.getPos;
          this.mount();
      }
      mount() {
          // eslint-disable-next-line
          return;
      }
      get dom() {
          return this.editor.view.dom;
      }
      get contentDOM() {
          return null;
      }
      onDragStart(event) {
          var _a, _b, _c, _d, _e, _f, _g;
          const { view } = this.editor;
          const target = event.target;
          // get the drag handle element
          // `closest` is not available for text nodes so we may have to use its parent
          const dragHandle = target.nodeType === 3
              ? (_a = target.parentElement) === null || _a === void 0 ? void 0 : _a.closest('[data-drag-handle]')
              : target.closest('[data-drag-handle]');
          if (!this.dom || ((_b = this.contentDOM) === null || _b === void 0 ? void 0 : _b.contains(target)) || !dragHandle) {
              return;
          }
          let x = 0;
          let y = 0;
          // calculate offset for drag element if we use a different drag handle element
          if (this.dom !== dragHandle) {
              const domBox = this.dom.getBoundingClientRect();
              const handleBox = dragHandle.getBoundingClientRect();
              // In React, we have to go through nativeEvent to reach offsetX/offsetY.
              const offsetX = (_c = event.offsetX) !== null && _c !== void 0 ? _c : (_d = event.nativeEvent) === null || _d === void 0 ? void 0 : _d.offsetX;
              const offsetY = (_e = event.offsetY) !== null && _e !== void 0 ? _e : (_f = event.nativeEvent) === null || _f === void 0 ? void 0 : _f.offsetY;
              x = handleBox.x - domBox.x + offsetX;
              y = handleBox.y - domBox.y + offsetY;
          }
          (_g = event.dataTransfer) === null || _g === void 0 ? void 0 : _g.setDragImage(this.dom, x, y);
          // we need to tell ProseMirror that we want to move the whole node
          // so we create a NodeSelection
          const selection = state.NodeSelection.create(view.state.doc, this.getPos());
          const transaction = view.state.tr.setSelection(selection);
          view.dispatch(transaction);
      }
      stopEvent(event) {
          var _a;
          if (!this.dom) {
              return false;
          }
          if (typeof this.options.stopEvent === 'function') {
              return this.options.stopEvent({ event });
          }
          const target = event.target;
          const isInElement = this.dom.contains(target) && !((_a = this.contentDOM) === null || _a === void 0 ? void 0 : _a.contains(target));
          // any event from child nodes should be handled by ProseMirror
          if (!isInElement) {
              return false;
          }
          const isDragEvent = event.type.startsWith('drag');
          const isDropEvent = event.type === 'drop';
          const isInput = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;
          // any input event within node views should be ignored by ProseMirror
          if (isInput && !isDropEvent && !isDragEvent) {
              return true;
          }
          const { isEditable } = this.editor;
          const { isDragging } = this;
          const isDraggable = !!this.node.type.spec.draggable;
          const isSelectable = state.NodeSelection.isSelectable(this.node);
          const isCopyEvent = event.type === 'copy';
          const isPasteEvent = event.type === 'paste';
          const isCutEvent = event.type === 'cut';
          const isClickEvent = event.type === 'mousedown';
          // ProseMirror tries to drag selectable nodes
          // even if `draggable` is set to `false`
          // this fix prevents that
          if (!isDraggable && isSelectable && isDragEvent) {
              event.preventDefault();
          }
          if (isDraggable && isDragEvent && !isDragging) {
              event.preventDefault();
              return false;
          }
          // we have to store that dragging started
          if (isDraggable && isEditable && !isDragging && isClickEvent) {
              const dragHandle = target.closest('[data-drag-handle]');
              const isValidDragHandle = dragHandle && (this.dom === dragHandle || this.dom.contains(dragHandle));
              if (isValidDragHandle) {
                  this.isDragging = true;
                  document.addEventListener('dragend', () => {
                      this.isDragging = false;
                  }, { once: true });
                  document.addEventListener('drop', () => {
                      this.isDragging = false;
                  }, { once: true });
                  document.addEventListener('mouseup', () => {
                      this.isDragging = false;
                  }, { once: true });
              }
          }
          // these events are handled by prosemirror
          if (isDragging
              || isDropEvent
              || isCopyEvent
              || isPasteEvent
              || isCutEvent
              || (isClickEvent && isSelectable)) {
              return false;
          }
          return true;
      }
      ignoreMutation(mutation) {
          if (!this.dom || !this.contentDOM) {
              return true;
          }
          if (typeof this.options.ignoreMutation === 'function') {
              return this.options.ignoreMutation({ mutation });
          }
          // a leaf/atom node is like a black box for ProseMirror
          // and should be fully handled by the node view
          if (this.node.isLeaf || this.node.isAtom) {
              return true;
          }
          // ProseMirror should handle any selections
          if (mutation.type === 'selection') {
              return false;
          }
          // try to prevent a bug on iOS and Android that will break node views on enter
          // this is because ProseMirror can’t preventDispatch on enter
          // this will lead to a re-render of the node view on enter
          // see: https://github.com/ueberdosis/tiptap/issues/1214
          // see: https://github.com/ueberdosis/tiptap/issues/2534
          if (this.dom.contains(mutation.target)
              && mutation.type === 'childList'
              && (isiOS() || isAndroid())
              && this.editor.isFocused) {
              const changedNodes = [
                  ...Array.from(mutation.addedNodes),
                  ...Array.from(mutation.removedNodes),
              ];
              // we’ll check if every changed node is contentEditable
              // to make sure it’s probably mutated by ProseMirror
              if (changedNodes.every(node => node.isContentEditable)) {
                  return false;
              }
          }
          // we will allow mutation contentDOM with attributes
          // so we can for example adding classes within our node view
          if (this.contentDOM === mutation.target && mutation.type === 'attributes') {
              return true;
          }
          // ProseMirror should handle any changes within contentDOM
          if (this.contentDOM.contains(mutation.target)) {
              return false;
          }
          return true;
      }
      updateAttributes(attributes) {
          this.editor.commands.command(({ tr }) => {
              const pos = this.getPos();
              tr.setNodeMarkup(pos, undefined, {
                  ...this.node.attrs,
                  ...attributes,
              });
              return true;
          });
      }
      deleteNode() {
          const from = this.getPos();
          const to = from + this.node.nodeSize;
          this.editor.commands.deleteRange({ from, to });
      }
  }

  function getDefaultExportFromCjs (x) {
  	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
  }

  var react = {exports: {}};

  var react_production_min = {};

  /**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  var hasRequiredReact_production_min;

  function requireReact_production_min () {
  	if (hasRequiredReact_production_min) return react_production_min;
  	hasRequiredReact_production_min = 1;
  var l=Symbol.for("react.element"),n=Symbol.for("react.portal"),p=Symbol.for("react.fragment"),q=Symbol.for("react.strict_mode"),r=Symbol.for("react.profiler"),t=Symbol.for("react.provider"),u=Symbol.for("react.context"),v=Symbol.for("react.forward_ref"),w=Symbol.for("react.suspense"),x=Symbol.for("react.memo"),y=Symbol.for("react.lazy"),z=Symbol.iterator;function A(a){if(null===a||"object"!==typeof a)return null;a=z&&a[z]||a["@@iterator"];return "function"===typeof a?a:null}
  	var B={isMounted:function(){return !1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},C=Object.assign,D={};function E(a,b,e){this.props=a;this.context=b;this.refs=D;this.updater=e||B;}E.prototype.isReactComponent={};
  	E.prototype.setState=function(a,b){if("object"!==typeof a&&"function"!==typeof a&&null!=a)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,a,b,"setState");};E.prototype.forceUpdate=function(a){this.updater.enqueueForceUpdate(this,a,"forceUpdate");};function F(){}F.prototype=E.prototype;function G(a,b,e){this.props=a;this.context=b;this.refs=D;this.updater=e||B;}var H=G.prototype=new F;
  	H.constructor=G;C(H,E.prototype);H.isPureReactComponent=!0;var I=Array.isArray,J=Object.prototype.hasOwnProperty,K={current:null},L={key:!0,ref:!0,__self:!0,__source:!0};
  	function M(a,b,e){var d,c={},k=null,h=null;if(null!=b)for(d in void 0!==b.ref&&(h=b.ref),void 0!==b.key&&(k=""+b.key),b)J.call(b,d)&&!L.hasOwnProperty(d)&&(c[d]=b[d]);var g=arguments.length-2;if(1===g)c.children=e;else if(1<g){for(var f=Array(g),m=0;m<g;m++)f[m]=arguments[m+2];c.children=f;}if(a&&a.defaultProps)for(d in g=a.defaultProps,g)void 0===c[d]&&(c[d]=g[d]);return {$$typeof:l,type:a,key:k,ref:h,props:c,_owner:K.current}}
  	function N(a,b){return {$$typeof:l,type:a.type,key:b,ref:a.ref,props:a.props,_owner:a._owner}}function O(a){return "object"===typeof a&&null!==a&&a.$$typeof===l}function escape(a){var b={"=":"=0",":":"=2"};return "$"+a.replace(/[=:]/g,function(a){return b[a]})}var P=/\/+/g;function Q(a,b){return "object"===typeof a&&null!==a&&null!=a.key?escape(""+a.key):b.toString(36)}
  	function R(a,b,e,d,c){var k=typeof a;if("undefined"===k||"boolean"===k)a=null;var h=!1;if(null===a)h=!0;else switch(k){case "string":case "number":h=!0;break;case "object":switch(a.$$typeof){case l:case n:h=!0;}}if(h)return h=a,c=c(h),a=""===d?"."+Q(h,0):d,I(c)?(e="",null!=a&&(e=a.replace(P,"$&/")+"/"),R(c,b,e,"",function(a){return a})):null!=c&&(O(c)&&(c=N(c,e+(!c.key||h&&h.key===c.key?"":(""+c.key).replace(P,"$&/")+"/")+a)),b.push(c)),1;h=0;d=""===d?".":d+":";if(I(a))for(var g=0;g<a.length;g++){k=
  	a[g];var f=d+Q(k,g);h+=R(k,b,e,f,c);}else if(f=A(a),"function"===typeof f)for(a=f.call(a),g=0;!(k=a.next()).done;)k=k.value,f=d+Q(k,g++),h+=R(k,b,e,f,c);else if("object"===k)throw b=String(a),Error("Objects are not valid as a React child (found: "+("[object Object]"===b?"object with keys {"+Object.keys(a).join(", ")+"}":b)+"). If you meant to render a collection of children, use an array instead.");return h}
  	function S(a,b,e){if(null==a)return a;var d=[],c=0;R(a,d,"","",function(a){return b.call(e,a,c++)});return d}function T(a){if(-1===a._status){var b=a._result;b=b();b.then(function(b){if(0===a._status||-1===a._status)a._status=1,a._result=b;},function(b){if(0===a._status||-1===a._status)a._status=2,a._result=b;});-1===a._status&&(a._status=0,a._result=b);}if(1===a._status)return a._result.default;throw a._result;}
  	var U={current:null},V={transition:null},W={ReactCurrentDispatcher:U,ReactCurrentBatchConfig:V,ReactCurrentOwner:K};react_production_min.Children={map:S,forEach:function(a,b,e){S(a,function(){b.apply(this,arguments);},e);},count:function(a){var b=0;S(a,function(){b++;});return b},toArray:function(a){return S(a,function(a){return a})||[]},only:function(a){if(!O(a))throw Error("React.Children.only expected to receive a single React element child.");return a}};react_production_min.Component=E;react_production_min.Fragment=p;
  	react_production_min.Profiler=r;react_production_min.PureComponent=G;react_production_min.StrictMode=q;react_production_min.Suspense=w;react_production_min.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=W;
  	react_production_min.cloneElement=function(a,b,e){if(null===a||void 0===a)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+a+".");var d=C({},a.props),c=a.key,k=a.ref,h=a._owner;if(null!=b){void 0!==b.ref&&(k=b.ref,h=K.current);void 0!==b.key&&(c=""+b.key);if(a.type&&a.type.defaultProps)var g=a.type.defaultProps;for(f in b)J.call(b,f)&&!L.hasOwnProperty(f)&&(d[f]=void 0===b[f]&&void 0!==g?g[f]:b[f]);}var f=arguments.length-2;if(1===f)d.children=e;else if(1<f){g=Array(f);
  	for(var m=0;m<f;m++)g[m]=arguments[m+2];d.children=g;}return {$$typeof:l,type:a.type,key:c,ref:k,props:d,_owner:h}};react_production_min.createContext=function(a){a={$$typeof:u,_currentValue:a,_currentValue2:a,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null};a.Provider={$$typeof:t,_context:a};return a.Consumer=a};react_production_min.createElement=M;react_production_min.createFactory=function(a){var b=M.bind(null,a);b.type=a;return b};react_production_min.createRef=function(){return {current:null}};
  	react_production_min.forwardRef=function(a){return {$$typeof:v,render:a}};react_production_min.isValidElement=O;react_production_min.lazy=function(a){return {$$typeof:y,_payload:{_status:-1,_result:a},_init:T}};react_production_min.memo=function(a,b){return {$$typeof:x,type:a,compare:void 0===b?null:b}};react_production_min.startTransition=function(a){var b=V.transition;V.transition={};try{a();}finally{V.transition=b;}};react_production_min.unstable_act=function(){throw Error("act(...) is not supported in production builds of React.");};
  	react_production_min.useCallback=function(a,b){return U.current.useCallback(a,b)};react_production_min.useContext=function(a){return U.current.useContext(a)};react_production_min.useDebugValue=function(){};react_production_min.useDeferredValue=function(a){return U.current.useDeferredValue(a)};react_production_min.useEffect=function(a,b){return U.current.useEffect(a,b)};react_production_min.useId=function(){return U.current.useId()};react_production_min.useImperativeHandle=function(a,b,e){return U.current.useImperativeHandle(a,b,e)};
  	react_production_min.useInsertionEffect=function(a,b){return U.current.useInsertionEffect(a,b)};react_production_min.useLayoutEffect=function(a,b){return U.current.useLayoutEffect(a,b)};react_production_min.useMemo=function(a,b){return U.current.useMemo(a,b)};react_production_min.useReducer=function(a,b,e){return U.current.useReducer(a,b,e)};react_production_min.useRef=function(a){return U.current.useRef(a)};react_production_min.useState=function(a){return U.current.useState(a)};react_production_min.useSyncExternalStore=function(a,b,e){return U.current.useSyncExternalStore(a,b,e)};
  	react_production_min.useTransition=function(){return U.current.useTransition()};react_production_min.version="18.2.0";
  	return react_production_min;
  }

  var react_development = {exports: {}};

  /**
   * @license React
   * react.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */
  react_development.exports;

  var hasRequiredReact_development;

  function requireReact_development () {
  	if (hasRequiredReact_development) return react_development.exports;
  	hasRequiredReact_development = 1;
  	(function (module, exports) {

  		if (process.env.NODE_ENV !== "production") {
  		  (function() {

  		/* global __REACT_DEVTOOLS_GLOBAL_HOOK__ */
  		if (
  		  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined' &&
  		  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart ===
  		    'function'
  		) {
  		  __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(new Error());
  		}
  		          var ReactVersion = '18.2.0';

  		// ATTENTION
  		// When adding new symbols to this file,
  		// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
  		// The Symbol used to tag the ReactElement-like types.
  		var REACT_ELEMENT_TYPE = Symbol.for('react.element');
  		var REACT_PORTAL_TYPE = Symbol.for('react.portal');
  		var REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
  		var REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
  		var REACT_PROFILER_TYPE = Symbol.for('react.profiler');
  		var REACT_PROVIDER_TYPE = Symbol.for('react.provider');
  		var REACT_CONTEXT_TYPE = Symbol.for('react.context');
  		var REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
  		var REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
  		var REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
  		var REACT_MEMO_TYPE = Symbol.for('react.memo');
  		var REACT_LAZY_TYPE = Symbol.for('react.lazy');
  		var REACT_OFFSCREEN_TYPE = Symbol.for('react.offscreen');
  		var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
  		var FAUX_ITERATOR_SYMBOL = '@@iterator';
  		function getIteratorFn(maybeIterable) {
  		  if (maybeIterable === null || typeof maybeIterable !== 'object') {
  		    return null;
  		  }

  		  var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];

  		  if (typeof maybeIterator === 'function') {
  		    return maybeIterator;
  		  }

  		  return null;
  		}

  		/**
  		 * Keeps track of the current dispatcher.
  		 */
  		var ReactCurrentDispatcher = {
  		  /**
  		   * @internal
  		   * @type {ReactComponent}
  		   */
  		  current: null
  		};

  		/**
  		 * Keeps track of the current batch's configuration such as how long an update
  		 * should suspend for if it needs to.
  		 */
  		var ReactCurrentBatchConfig = {
  		  transition: null
  		};

  		var ReactCurrentActQueue = {
  		  current: null,
  		  // Used to reproduce behavior of `batchedUpdates` in legacy mode.
  		  isBatchingLegacy: false,
  		  didScheduleLegacyUpdate: false
  		};

  		/**
  		 * Keeps track of the current owner.
  		 *
  		 * The current owner is the component who should own any components that are
  		 * currently being constructed.
  		 */
  		var ReactCurrentOwner = {
  		  /**
  		   * @internal
  		   * @type {ReactComponent}
  		   */
  		  current: null
  		};

  		var ReactDebugCurrentFrame = {};
  		var currentExtraStackFrame = null;
  		function setExtraStackFrame(stack) {
  		  {
  		    currentExtraStackFrame = stack;
  		  }
  		}

  		{
  		  ReactDebugCurrentFrame.setExtraStackFrame = function (stack) {
  		    {
  		      currentExtraStackFrame = stack;
  		    }
  		  }; // Stack implementation injected by the current renderer.


  		  ReactDebugCurrentFrame.getCurrentStack = null;

  		  ReactDebugCurrentFrame.getStackAddendum = function () {
  		    var stack = ''; // Add an extra top frame while an element is being validated

  		    if (currentExtraStackFrame) {
  		      stack += currentExtraStackFrame;
  		    } // Delegate to the injected renderer-specific implementation


  		    var impl = ReactDebugCurrentFrame.getCurrentStack;

  		    if (impl) {
  		      stack += impl() || '';
  		    }

  		    return stack;
  		  };
  		}

  		// -----------------------------------------------------------------------------

  		var enableScopeAPI = false; // Experimental Create Event Handle API.
  		var enableCacheElement = false;
  		var enableTransitionTracing = false; // No known bugs, but needs performance testing

  		var enableLegacyHidden = false; // Enables unstable_avoidThisFallback feature in Fiber
  		// stuff. Intended to enable React core members to more easily debug scheduling
  		// issues in DEV builds.

  		var enableDebugTracing = false; // Track which Fiber(s) schedule render work.

  		var ReactSharedInternals = {
  		  ReactCurrentDispatcher: ReactCurrentDispatcher,
  		  ReactCurrentBatchConfig: ReactCurrentBatchConfig,
  		  ReactCurrentOwner: ReactCurrentOwner
  		};

  		{
  		  ReactSharedInternals.ReactDebugCurrentFrame = ReactDebugCurrentFrame;
  		  ReactSharedInternals.ReactCurrentActQueue = ReactCurrentActQueue;
  		}

  		// by calls to these methods by a Babel plugin.
  		//
  		// In PROD (or in packages without access to React internals),
  		// they are left as they are instead.

  		function warn(format) {
  		  {
  		    {
  		      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
  		        args[_key - 1] = arguments[_key];
  		      }

  		      printWarning('warn', format, args);
  		    }
  		  }
  		}
  		function error(format) {
  		  {
  		    {
  		      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
  		        args[_key2 - 1] = arguments[_key2];
  		      }

  		      printWarning('error', format, args);
  		    }
  		  }
  		}

  		function printWarning(level, format, args) {
  		  // When changing this logic, you might want to also
  		  // update consoleWithStackDev.www.js as well.
  		  {
  		    var ReactDebugCurrentFrame = ReactSharedInternals.ReactDebugCurrentFrame;
  		    var stack = ReactDebugCurrentFrame.getStackAddendum();

  		    if (stack !== '') {
  		      format += '%s';
  		      args = args.concat([stack]);
  		    } // eslint-disable-next-line react-internal/safe-string-coercion


  		    var argsWithFormat = args.map(function (item) {
  		      return String(item);
  		    }); // Careful: RN currently depends on this prefix

  		    argsWithFormat.unshift('Warning: ' + format); // We intentionally don't use spread (or .apply) directly because it
  		    // breaks IE9: https://github.com/facebook/react/issues/13610
  		    // eslint-disable-next-line react-internal/no-production-logging

  		    Function.prototype.apply.call(console[level], console, argsWithFormat);
  		  }
  		}

  		var didWarnStateUpdateForUnmountedComponent = {};

  		function warnNoop(publicInstance, callerName) {
  		  {
  		    var _constructor = publicInstance.constructor;
  		    var componentName = _constructor && (_constructor.displayName || _constructor.name) || 'ReactClass';
  		    var warningKey = componentName + "." + callerName;

  		    if (didWarnStateUpdateForUnmountedComponent[warningKey]) {
  		      return;
  		    }

  		    error("Can't call %s on a component that is not yet mounted. " + 'This is a no-op, but it might indicate a bug in your application. ' + 'Instead, assign to `this.state` directly or define a `state = {};` ' + 'class property with the desired state in the %s component.', callerName, componentName);

  		    didWarnStateUpdateForUnmountedComponent[warningKey] = true;
  		  }
  		}
  		/**
  		 * This is the abstract API for an update queue.
  		 */


  		var ReactNoopUpdateQueue = {
  		  /**
  		   * Checks whether or not this composite component is mounted.
  		   * @param {ReactClass} publicInstance The instance we want to test.
  		   * @return {boolean} True if mounted, false otherwise.
  		   * @protected
  		   * @final
  		   */
  		  isMounted: function (publicInstance) {
  		    return false;
  		  },

  		  /**
  		   * Forces an update. This should only be invoked when it is known with
  		   * certainty that we are **not** in a DOM transaction.
  		   *
  		   * You may want to call this when you know that some deeper aspect of the
  		   * component's state has changed but `setState` was not called.
  		   *
  		   * This will not invoke `shouldComponentUpdate`, but it will invoke
  		   * `componentWillUpdate` and `componentDidUpdate`.
  		   *
  		   * @param {ReactClass} publicInstance The instance that should rerender.
  		   * @param {?function} callback Called after component is updated.
  		   * @param {?string} callerName name of the calling function in the public API.
  		   * @internal
  		   */
  		  enqueueForceUpdate: function (publicInstance, callback, callerName) {
  		    warnNoop(publicInstance, 'forceUpdate');
  		  },

  		  /**
  		   * Replaces all of the state. Always use this or `setState` to mutate state.
  		   * You should treat `this.state` as immutable.
  		   *
  		   * There is no guarantee that `this.state` will be immediately updated, so
  		   * accessing `this.state` after calling this method may return the old value.
  		   *
  		   * @param {ReactClass} publicInstance The instance that should rerender.
  		   * @param {object} completeState Next state.
  		   * @param {?function} callback Called after component is updated.
  		   * @param {?string} callerName name of the calling function in the public API.
  		   * @internal
  		   */
  		  enqueueReplaceState: function (publicInstance, completeState, callback, callerName) {
  		    warnNoop(publicInstance, 'replaceState');
  		  },

  		  /**
  		   * Sets a subset of the state. This only exists because _pendingState is
  		   * internal. This provides a merging strategy that is not available to deep
  		   * properties which is confusing. TODO: Expose pendingState or don't use it
  		   * during the merge.
  		   *
  		   * @param {ReactClass} publicInstance The instance that should rerender.
  		   * @param {object} partialState Next partial state to be merged with state.
  		   * @param {?function} callback Called after component is updated.
  		   * @param {?string} Name of the calling function in the public API.
  		   * @internal
  		   */
  		  enqueueSetState: function (publicInstance, partialState, callback, callerName) {
  		    warnNoop(publicInstance, 'setState');
  		  }
  		};

  		var assign = Object.assign;

  		var emptyObject = {};

  		{
  		  Object.freeze(emptyObject);
  		}
  		/**
  		 * Base class helpers for the updating state of a component.
  		 */


  		function Component(props, context, updater) {
  		  this.props = props;
  		  this.context = context; // If a component has string refs, we will assign a different object later.

  		  this.refs = emptyObject; // We initialize the default updater but the real one gets injected by the
  		  // renderer.

  		  this.updater = updater || ReactNoopUpdateQueue;
  		}

  		Component.prototype.isReactComponent = {};
  		/**
  		 * Sets a subset of the state. Always use this to mutate
  		 * state. You should treat `this.state` as immutable.
  		 *
  		 * There is no guarantee that `this.state` will be immediately updated, so
  		 * accessing `this.state` after calling this method may return the old value.
  		 *
  		 * There is no guarantee that calls to `setState` will run synchronously,
  		 * as they may eventually be batched together.  You can provide an optional
  		 * callback that will be executed when the call to setState is actually
  		 * completed.
  		 *
  		 * When a function is provided to setState, it will be called at some point in
  		 * the future (not synchronously). It will be called with the up to date
  		 * component arguments (state, props, context). These values can be different
  		 * from this.* because your function may be called after receiveProps but before
  		 * shouldComponentUpdate, and this new state, props, and context will not yet be
  		 * assigned to this.
  		 *
  		 * @param {object|function} partialState Next partial state or function to
  		 *        produce next partial state to be merged with current state.
  		 * @param {?function} callback Called after state is updated.
  		 * @final
  		 * @protected
  		 */

  		Component.prototype.setState = function (partialState, callback) {
  		  if (typeof partialState !== 'object' && typeof partialState !== 'function' && partialState != null) {
  		    throw new Error('setState(...): takes an object of state variables to update or a ' + 'function which returns an object of state variables.');
  		  }

  		  this.updater.enqueueSetState(this, partialState, callback, 'setState');
  		};
  		/**
  		 * Forces an update. This should only be invoked when it is known with
  		 * certainty that we are **not** in a DOM transaction.
  		 *
  		 * You may want to call this when you know that some deeper aspect of the
  		 * component's state has changed but `setState` was not called.
  		 *
  		 * This will not invoke `shouldComponentUpdate`, but it will invoke
  		 * `componentWillUpdate` and `componentDidUpdate`.
  		 *
  		 * @param {?function} callback Called after update is complete.
  		 * @final
  		 * @protected
  		 */


  		Component.prototype.forceUpdate = function (callback) {
  		  this.updater.enqueueForceUpdate(this, callback, 'forceUpdate');
  		};
  		/**
  		 * Deprecated APIs. These APIs used to exist on classic React classes but since
  		 * we would like to deprecate them, we're not going to move them over to this
  		 * modern base class. Instead, we define a getter that warns if it's accessed.
  		 */


  		{
  		  var deprecatedAPIs = {
  		    isMounted: ['isMounted', 'Instead, make sure to clean up subscriptions and pending requests in ' + 'componentWillUnmount to prevent memory leaks.'],
  		    replaceState: ['replaceState', 'Refactor your code to use setState instead (see ' + 'https://github.com/facebook/react/issues/3236).']
  		  };

  		  var defineDeprecationWarning = function (methodName, info) {
  		    Object.defineProperty(Component.prototype, methodName, {
  		      get: function () {
  		        warn('%s(...) is deprecated in plain JavaScript React classes. %s', info[0], info[1]);

  		        return undefined;
  		      }
  		    });
  		  };

  		  for (var fnName in deprecatedAPIs) {
  		    if (deprecatedAPIs.hasOwnProperty(fnName)) {
  		      defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
  		    }
  		  }
  		}

  		function ComponentDummy() {}

  		ComponentDummy.prototype = Component.prototype;
  		/**
  		 * Convenience component with default shallow equality check for sCU.
  		 */

  		function PureComponent(props, context, updater) {
  		  this.props = props;
  		  this.context = context; // If a component has string refs, we will assign a different object later.

  		  this.refs = emptyObject;
  		  this.updater = updater || ReactNoopUpdateQueue;
  		}

  		var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
  		pureComponentPrototype.constructor = PureComponent; // Avoid an extra prototype jump for these methods.

  		assign(pureComponentPrototype, Component.prototype);
  		pureComponentPrototype.isPureReactComponent = true;

  		// an immutable object with a single mutable value
  		function createRef() {
  		  var refObject = {
  		    current: null
  		  };

  		  {
  		    Object.seal(refObject);
  		  }

  		  return refObject;
  		}

  		var isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

  		function isArray(a) {
  		  return isArrayImpl(a);
  		}

  		/*
  		 * The `'' + value` pattern (used in in perf-sensitive code) throws for Symbol
  		 * and Temporal.* types. See https://github.com/facebook/react/pull/22064.
  		 *
  		 * The functions in this module will throw an easier-to-understand,
  		 * easier-to-debug exception with a clear errors message message explaining the
  		 * problem. (Instead of a confusing exception thrown inside the implementation
  		 * of the `value` object).
  		 */
  		// $FlowFixMe only called in DEV, so void return is not possible.
  		function typeName(value) {
  		  {
  		    // toStringTag is needed for namespaced types like Temporal.Instant
  		    var hasToStringTag = typeof Symbol === 'function' && Symbol.toStringTag;
  		    var type = hasToStringTag && value[Symbol.toStringTag] || value.constructor.name || 'Object';
  		    return type;
  		  }
  		} // $FlowFixMe only called in DEV, so void return is not possible.


  		function willCoercionThrow(value) {
  		  {
  		    try {
  		      testStringCoercion(value);
  		      return false;
  		    } catch (e) {
  		      return true;
  		    }
  		  }
  		}

  		function testStringCoercion(value) {
  		  // If you ended up here by following an exception call stack, here's what's
  		  // happened: you supplied an object or symbol value to React (as a prop, key,
  		  // DOM attribute, CSS property, string ref, etc.) and when React tried to
  		  // coerce it to a string using `'' + value`, an exception was thrown.
  		  //
  		  // The most common types that will cause this exception are `Symbol` instances
  		  // and Temporal objects like `Temporal.Instant`. But any object that has a
  		  // `valueOf` or `[Symbol.toPrimitive]` method that throws will also cause this
  		  // exception. (Library authors do this to prevent users from using built-in
  		  // numeric operators like `+` or comparison operators like `>=` because custom
  		  // methods are needed to perform accurate arithmetic or comparison.)
  		  //
  		  // To fix the problem, coerce this object or symbol value to a string before
  		  // passing it to React. The most reliable way is usually `String(value)`.
  		  //
  		  // To find which value is throwing, check the browser or debugger console.
  		  // Before this exception was thrown, there should be `console.error` output
  		  // that shows the type (Symbol, Temporal.PlainDate, etc.) that caused the
  		  // problem and how that type was used: key, atrribute, input value prop, etc.
  		  // In most cases, this console output also shows the component and its
  		  // ancestor components where the exception happened.
  		  //
  		  // eslint-disable-next-line react-internal/safe-string-coercion
  		  return '' + value;
  		}
  		function checkKeyStringCoercion(value) {
  		  {
  		    if (willCoercionThrow(value)) {
  		      error('The provided key is an unsupported type %s.' + ' This value must be coerced to a string before before using it here.', typeName(value));

  		      return testStringCoercion(value); // throw (to help callers find troubleshooting comments)
  		    }
  		  }
  		}

  		function getWrappedName(outerType, innerType, wrapperName) {
  		  var displayName = outerType.displayName;

  		  if (displayName) {
  		    return displayName;
  		  }

  		  var functionName = innerType.displayName || innerType.name || '';
  		  return functionName !== '' ? wrapperName + "(" + functionName + ")" : wrapperName;
  		} // Keep in sync with react-reconciler/getComponentNameFromFiber


  		function getContextName(type) {
  		  return type.displayName || 'Context';
  		} // Note that the reconciler package should generally prefer to use getComponentNameFromFiber() instead.


  		function getComponentNameFromType(type) {
  		  if (type == null) {
  		    // Host root, text node or just invalid type.
  		    return null;
  		  }

  		  {
  		    if (typeof type.tag === 'number') {
  		      error('Received an unexpected object in getComponentNameFromType(). ' + 'This is likely a bug in React. Please file an issue.');
  		    }
  		  }

  		  if (typeof type === 'function') {
  		    return type.displayName || type.name || null;
  		  }

  		  if (typeof type === 'string') {
  		    return type;
  		  }

  		  switch (type) {
  		    case REACT_FRAGMENT_TYPE:
  		      return 'Fragment';

  		    case REACT_PORTAL_TYPE:
  		      return 'Portal';

  		    case REACT_PROFILER_TYPE:
  		      return 'Profiler';

  		    case REACT_STRICT_MODE_TYPE:
  		      return 'StrictMode';

  		    case REACT_SUSPENSE_TYPE:
  		      return 'Suspense';

  		    case REACT_SUSPENSE_LIST_TYPE:
  		      return 'SuspenseList';

  		  }

  		  if (typeof type === 'object') {
  		    switch (type.$$typeof) {
  		      case REACT_CONTEXT_TYPE:
  		        var context = type;
  		        return getContextName(context) + '.Consumer';

  		      case REACT_PROVIDER_TYPE:
  		        var provider = type;
  		        return getContextName(provider._context) + '.Provider';

  		      case REACT_FORWARD_REF_TYPE:
  		        return getWrappedName(type, type.render, 'ForwardRef');

  		      case REACT_MEMO_TYPE:
  		        var outerName = type.displayName || null;

  		        if (outerName !== null) {
  		          return outerName;
  		        }

  		        return getComponentNameFromType(type.type) || 'Memo';

  		      case REACT_LAZY_TYPE:
  		        {
  		          var lazyComponent = type;
  		          var payload = lazyComponent._payload;
  		          var init = lazyComponent._init;

  		          try {
  		            return getComponentNameFromType(init(payload));
  		          } catch (x) {
  		            return null;
  		          }
  		        }

  		      // eslint-disable-next-line no-fallthrough
  		    }
  		  }

  		  return null;
  		}

  		var hasOwnProperty = Object.prototype.hasOwnProperty;

  		var RESERVED_PROPS = {
  		  key: true,
  		  ref: true,
  		  __self: true,
  		  __source: true
  		};
  		var specialPropKeyWarningShown, specialPropRefWarningShown, didWarnAboutStringRefs;

  		{
  		  didWarnAboutStringRefs = {};
  		}

  		function hasValidRef(config) {
  		  {
  		    if (hasOwnProperty.call(config, 'ref')) {
  		      var getter = Object.getOwnPropertyDescriptor(config, 'ref').get;

  		      if (getter && getter.isReactWarning) {
  		        return false;
  		      }
  		    }
  		  }

  		  return config.ref !== undefined;
  		}

  		function hasValidKey(config) {
  		  {
  		    if (hasOwnProperty.call(config, 'key')) {
  		      var getter = Object.getOwnPropertyDescriptor(config, 'key').get;

  		      if (getter && getter.isReactWarning) {
  		        return false;
  		      }
  		    }
  		  }

  		  return config.key !== undefined;
  		}

  		function defineKeyPropWarningGetter(props, displayName) {
  		  var warnAboutAccessingKey = function () {
  		    {
  		      if (!specialPropKeyWarningShown) {
  		        specialPropKeyWarningShown = true;

  		        error('%s: `key` is not a prop. Trying to access it will result ' + 'in `undefined` being returned. If you need to access the same ' + 'value within the child component, you should pass it as a different ' + 'prop. (https://reactjs.org/link/special-props)', displayName);
  		      }
  		    }
  		  };

  		  warnAboutAccessingKey.isReactWarning = true;
  		  Object.defineProperty(props, 'key', {
  		    get: warnAboutAccessingKey,
  		    configurable: true
  		  });
  		}

  		function defineRefPropWarningGetter(props, displayName) {
  		  var warnAboutAccessingRef = function () {
  		    {
  		      if (!specialPropRefWarningShown) {
  		        specialPropRefWarningShown = true;

  		        error('%s: `ref` is not a prop. Trying to access it will result ' + 'in `undefined` being returned. If you need to access the same ' + 'value within the child component, you should pass it as a different ' + 'prop. (https://reactjs.org/link/special-props)', displayName);
  		      }
  		    }
  		  };

  		  warnAboutAccessingRef.isReactWarning = true;
  		  Object.defineProperty(props, 'ref', {
  		    get: warnAboutAccessingRef,
  		    configurable: true
  		  });
  		}

  		function warnIfStringRefCannotBeAutoConverted(config) {
  		  {
  		    if (typeof config.ref === 'string' && ReactCurrentOwner.current && config.__self && ReactCurrentOwner.current.stateNode !== config.__self) {
  		      var componentName = getComponentNameFromType(ReactCurrentOwner.current.type);

  		      if (!didWarnAboutStringRefs[componentName]) {
  		        error('Component "%s" contains the string ref "%s". ' + 'Support for string refs will be removed in a future major release. ' + 'This case cannot be automatically converted to an arrow function. ' + 'We ask you to manually fix this case by using useRef() or createRef() instead. ' + 'Learn more about using refs safely here: ' + 'https://reactjs.org/link/strict-mode-string-ref', componentName, config.ref);

  		        didWarnAboutStringRefs[componentName] = true;
  		      }
  		    }
  		  }
  		}
  		/**
  		 * Factory method to create a new React element. This no longer adheres to
  		 * the class pattern, so do not use new to call it. Also, instanceof check
  		 * will not work. Instead test $$typeof field against Symbol.for('react.element') to check
  		 * if something is a React Element.
  		 *
  		 * @param {*} type
  		 * @param {*} props
  		 * @param {*} key
  		 * @param {string|object} ref
  		 * @param {*} owner
  		 * @param {*} self A *temporary* helper to detect places where `this` is
  		 * different from the `owner` when React.createElement is called, so that we
  		 * can warn. We want to get rid of owner and replace string `ref`s with arrow
  		 * functions, and as long as `this` and owner are the same, there will be no
  		 * change in behavior.
  		 * @param {*} source An annotation object (added by a transpiler or otherwise)
  		 * indicating filename, line number, and/or other information.
  		 * @internal
  		 */


  		var ReactElement = function (type, key, ref, self, source, owner, props) {
  		  var element = {
  		    // This tag allows us to uniquely identify this as a React Element
  		    $$typeof: REACT_ELEMENT_TYPE,
  		    // Built-in properties that belong on the element
  		    type: type,
  		    key: key,
  		    ref: ref,
  		    props: props,
  		    // Record the component responsible for creating this element.
  		    _owner: owner
  		  };

  		  {
  		    // The validation flag is currently mutative. We put it on
  		    // an external backing store so that we can freeze the whole object.
  		    // This can be replaced with a WeakMap once they are implemented in
  		    // commonly used development environments.
  		    element._store = {}; // To make comparing ReactElements easier for testing purposes, we make
  		    // the validation flag non-enumerable (where possible, which should
  		    // include every environment we run tests in), so the test framework
  		    // ignores it.

  		    Object.defineProperty(element._store, 'validated', {
  		      configurable: false,
  		      enumerable: false,
  		      writable: true,
  		      value: false
  		    }); // self and source are DEV only properties.

  		    Object.defineProperty(element, '_self', {
  		      configurable: false,
  		      enumerable: false,
  		      writable: false,
  		      value: self
  		    }); // Two elements created in two different places should be considered
  		    // equal for testing purposes and therefore we hide it from enumeration.

  		    Object.defineProperty(element, '_source', {
  		      configurable: false,
  		      enumerable: false,
  		      writable: false,
  		      value: source
  		    });

  		    if (Object.freeze) {
  		      Object.freeze(element.props);
  		      Object.freeze(element);
  		    }
  		  }

  		  return element;
  		};
  		/**
  		 * Create and return a new ReactElement of the given type.
  		 * See https://reactjs.org/docs/react-api.html#createelement
  		 */

  		function createElement(type, config, children) {
  		  var propName; // Reserved names are extracted

  		  var props = {};
  		  var key = null;
  		  var ref = null;
  		  var self = null;
  		  var source = null;

  		  if (config != null) {
  		    if (hasValidRef(config)) {
  		      ref = config.ref;

  		      {
  		        warnIfStringRefCannotBeAutoConverted(config);
  		      }
  		    }

  		    if (hasValidKey(config)) {
  		      {
  		        checkKeyStringCoercion(config.key);
  		      }

  		      key = '' + config.key;
  		    }

  		    self = config.__self === undefined ? null : config.__self;
  		    source = config.__source === undefined ? null : config.__source; // Remaining properties are added to a new props object

  		    for (propName in config) {
  		      if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
  		        props[propName] = config[propName];
  		      }
  		    }
  		  } // Children can be more than one argument, and those are transferred onto
  		  // the newly allocated props object.


  		  var childrenLength = arguments.length - 2;

  		  if (childrenLength === 1) {
  		    props.children = children;
  		  } else if (childrenLength > 1) {
  		    var childArray = Array(childrenLength);

  		    for (var i = 0; i < childrenLength; i++) {
  		      childArray[i] = arguments[i + 2];
  		    }

  		    {
  		      if (Object.freeze) {
  		        Object.freeze(childArray);
  		      }
  		    }

  		    props.children = childArray;
  		  } // Resolve default props


  		  if (type && type.defaultProps) {
  		    var defaultProps = type.defaultProps;

  		    for (propName in defaultProps) {
  		      if (props[propName] === undefined) {
  		        props[propName] = defaultProps[propName];
  		      }
  		    }
  		  }

  		  {
  		    if (key || ref) {
  		      var displayName = typeof type === 'function' ? type.displayName || type.name || 'Unknown' : type;

  		      if (key) {
  		        defineKeyPropWarningGetter(props, displayName);
  		      }

  		      if (ref) {
  		        defineRefPropWarningGetter(props, displayName);
  		      }
  		    }
  		  }

  		  return ReactElement(type, key, ref, self, source, ReactCurrentOwner.current, props);
  		}
  		function cloneAndReplaceKey(oldElement, newKey) {
  		  var newElement = ReactElement(oldElement.type, newKey, oldElement.ref, oldElement._self, oldElement._source, oldElement._owner, oldElement.props);
  		  return newElement;
  		}
  		/**
  		 * Clone and return a new ReactElement using element as the starting point.
  		 * See https://reactjs.org/docs/react-api.html#cloneelement
  		 */

  		function cloneElement(element, config, children) {
  		  if (element === null || element === undefined) {
  		    throw new Error("React.cloneElement(...): The argument must be a React element, but you passed " + element + ".");
  		  }

  		  var propName; // Original props are copied

  		  var props = assign({}, element.props); // Reserved names are extracted

  		  var key = element.key;
  		  var ref = element.ref; // Self is preserved since the owner is preserved.

  		  var self = element._self; // Source is preserved since cloneElement is unlikely to be targeted by a
  		  // transpiler, and the original source is probably a better indicator of the
  		  // true owner.

  		  var source = element._source; // Owner will be preserved, unless ref is overridden

  		  var owner = element._owner;

  		  if (config != null) {
  		    if (hasValidRef(config)) {
  		      // Silently steal the ref from the parent.
  		      ref = config.ref;
  		      owner = ReactCurrentOwner.current;
  		    }

  		    if (hasValidKey(config)) {
  		      {
  		        checkKeyStringCoercion(config.key);
  		      }

  		      key = '' + config.key;
  		    } // Remaining properties override existing props


  		    var defaultProps;

  		    if (element.type && element.type.defaultProps) {
  		      defaultProps = element.type.defaultProps;
  		    }

  		    for (propName in config) {
  		      if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
  		        if (config[propName] === undefined && defaultProps !== undefined) {
  		          // Resolve default props
  		          props[propName] = defaultProps[propName];
  		        } else {
  		          props[propName] = config[propName];
  		        }
  		      }
  		    }
  		  } // Children can be more than one argument, and those are transferred onto
  		  // the newly allocated props object.


  		  var childrenLength = arguments.length - 2;

  		  if (childrenLength === 1) {
  		    props.children = children;
  		  } else if (childrenLength > 1) {
  		    var childArray = Array(childrenLength);

  		    for (var i = 0; i < childrenLength; i++) {
  		      childArray[i] = arguments[i + 2];
  		    }

  		    props.children = childArray;
  		  }

  		  return ReactElement(element.type, key, ref, self, source, owner, props);
  		}
  		/**
  		 * Verifies the object is a ReactElement.
  		 * See https://reactjs.org/docs/react-api.html#isvalidelement
  		 * @param {?object} object
  		 * @return {boolean} True if `object` is a ReactElement.
  		 * @final
  		 */

  		function isValidElement(object) {
  		  return typeof object === 'object' && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
  		}

  		var SEPARATOR = '.';
  		var SUBSEPARATOR = ':';
  		/**
  		 * Escape and wrap key so it is safe to use as a reactid
  		 *
  		 * @param {string} key to be escaped.
  		 * @return {string} the escaped key.
  		 */

  		function escape(key) {
  		  var escapeRegex = /[=:]/g;
  		  var escaperLookup = {
  		    '=': '=0',
  		    ':': '=2'
  		  };
  		  var escapedString = key.replace(escapeRegex, function (match) {
  		    return escaperLookup[match];
  		  });
  		  return '$' + escapedString;
  		}
  		/**
  		 * TODO: Test that a single child and an array with one item have the same key
  		 * pattern.
  		 */


  		var didWarnAboutMaps = false;
  		var userProvidedKeyEscapeRegex = /\/+/g;

  		function escapeUserProvidedKey(text) {
  		  return text.replace(userProvidedKeyEscapeRegex, '$&/');
  		}
  		/**
  		 * Generate a key string that identifies a element within a set.
  		 *
  		 * @param {*} element A element that could contain a manual key.
  		 * @param {number} index Index that is used if a manual key is not provided.
  		 * @return {string}
  		 */


  		function getElementKey(element, index) {
  		  // Do some typechecking here since we call this blindly. We want to ensure
  		  // that we don't block potential future ES APIs.
  		  if (typeof element === 'object' && element !== null && element.key != null) {
  		    // Explicit key
  		    {
  		      checkKeyStringCoercion(element.key);
  		    }

  		    return escape('' + element.key);
  		  } // Implicit key determined by the index in the set


  		  return index.toString(36);
  		}

  		function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
  		  var type = typeof children;

  		  if (type === 'undefined' || type === 'boolean') {
  		    // All of the above are perceived as null.
  		    children = null;
  		  }

  		  var invokeCallback = false;

  		  if (children === null) {
  		    invokeCallback = true;
  		  } else {
  		    switch (type) {
  		      case 'string':
  		      case 'number':
  		        invokeCallback = true;
  		        break;

  		      case 'object':
  		        switch (children.$$typeof) {
  		          case REACT_ELEMENT_TYPE:
  		          case REACT_PORTAL_TYPE:
  		            invokeCallback = true;
  		        }

  		    }
  		  }

  		  if (invokeCallback) {
  		    var _child = children;
  		    var mappedChild = callback(_child); // If it's the only child, treat the name as if it was wrapped in an array
  		    // so that it's consistent if the number of children grows:

  		    var childKey = nameSoFar === '' ? SEPARATOR + getElementKey(_child, 0) : nameSoFar;

  		    if (isArray(mappedChild)) {
  		      var escapedChildKey = '';

  		      if (childKey != null) {
  		        escapedChildKey = escapeUserProvidedKey(childKey) + '/';
  		      }

  		      mapIntoArray(mappedChild, array, escapedChildKey, '', function (c) {
  		        return c;
  		      });
  		    } else if (mappedChild != null) {
  		      if (isValidElement(mappedChild)) {
  		        {
  		          // The `if` statement here prevents auto-disabling of the safe
  		          // coercion ESLint rule, so we must manually disable it below.
  		          // $FlowFixMe Flow incorrectly thinks React.Portal doesn't have a key
  		          if (mappedChild.key && (!_child || _child.key !== mappedChild.key)) {
  		            checkKeyStringCoercion(mappedChild.key);
  		          }
  		        }

  		        mappedChild = cloneAndReplaceKey(mappedChild, // Keep both the (mapped) and old keys if they differ, just as
  		        // traverseAllChildren used to do for objects as children
  		        escapedPrefix + ( // $FlowFixMe Flow incorrectly thinks React.Portal doesn't have a key
  		        mappedChild.key && (!_child || _child.key !== mappedChild.key) ? // $FlowFixMe Flow incorrectly thinks existing element's key can be a number
  		        // eslint-disable-next-line react-internal/safe-string-coercion
  		        escapeUserProvidedKey('' + mappedChild.key) + '/' : '') + childKey);
  		      }

  		      array.push(mappedChild);
  		    }

  		    return 1;
  		  }

  		  var child;
  		  var nextName;
  		  var subtreeCount = 0; // Count of children found in the current subtree.

  		  var nextNamePrefix = nameSoFar === '' ? SEPARATOR : nameSoFar + SUBSEPARATOR;

  		  if (isArray(children)) {
  		    for (var i = 0; i < children.length; i++) {
  		      child = children[i];
  		      nextName = nextNamePrefix + getElementKey(child, i);
  		      subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
  		    }
  		  } else {
  		    var iteratorFn = getIteratorFn(children);

  		    if (typeof iteratorFn === 'function') {
  		      var iterableChildren = children;

  		      {
  		        // Warn about using Maps as children
  		        if (iteratorFn === iterableChildren.entries) {
  		          if (!didWarnAboutMaps) {
  		            warn('Using Maps as children is not supported. ' + 'Use an array of keyed ReactElements instead.');
  		          }

  		          didWarnAboutMaps = true;
  		        }
  		      }

  		      var iterator = iteratorFn.call(iterableChildren);
  		      var step;
  		      var ii = 0;

  		      while (!(step = iterator.next()).done) {
  		        child = step.value;
  		        nextName = nextNamePrefix + getElementKey(child, ii++);
  		        subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
  		      }
  		    } else if (type === 'object') {
  		      // eslint-disable-next-line react-internal/safe-string-coercion
  		      var childrenString = String(children);
  		      throw new Error("Objects are not valid as a React child (found: " + (childrenString === '[object Object]' ? 'object with keys {' + Object.keys(children).join(', ') + '}' : childrenString) + "). " + 'If you meant to render a collection of children, use an array ' + 'instead.');
  		    }
  		  }

  		  return subtreeCount;
  		}

  		/**
  		 * Maps children that are typically specified as `props.children`.
  		 *
  		 * See https://reactjs.org/docs/react-api.html#reactchildrenmap
  		 *
  		 * The provided mapFunction(child, index) will be called for each
  		 * leaf child.
  		 *
  		 * @param {?*} children Children tree container.
  		 * @param {function(*, int)} func The map function.
  		 * @param {*} context Context for mapFunction.
  		 * @return {object} Object containing the ordered map of results.
  		 */
  		function mapChildren(children, func, context) {
  		  if (children == null) {
  		    return children;
  		  }

  		  var result = [];
  		  var count = 0;
  		  mapIntoArray(children, result, '', '', function (child) {
  		    return func.call(context, child, count++);
  		  });
  		  return result;
  		}
  		/**
  		 * Count the number of children that are typically specified as
  		 * `props.children`.
  		 *
  		 * See https://reactjs.org/docs/react-api.html#reactchildrencount
  		 *
  		 * @param {?*} children Children tree container.
  		 * @return {number} The number of children.
  		 */


  		function countChildren(children) {
  		  var n = 0;
  		  mapChildren(children, function () {
  		    n++; // Don't return anything
  		  });
  		  return n;
  		}

  		/**
  		 * Iterates through children that are typically specified as `props.children`.
  		 *
  		 * See https://reactjs.org/docs/react-api.html#reactchildrenforeach
  		 *
  		 * The provided forEachFunc(child, index) will be called for each
  		 * leaf child.
  		 *
  		 * @param {?*} children Children tree container.
  		 * @param {function(*, int)} forEachFunc
  		 * @param {*} forEachContext Context for forEachContext.
  		 */
  		function forEachChildren(children, forEachFunc, forEachContext) {
  		  mapChildren(children, function () {
  		    forEachFunc.apply(this, arguments); // Don't return anything.
  		  }, forEachContext);
  		}
  		/**
  		 * Flatten a children object (typically specified as `props.children`) and
  		 * return an array with appropriately re-keyed children.
  		 *
  		 * See https://reactjs.org/docs/react-api.html#reactchildrentoarray
  		 */


  		function toArray(children) {
  		  return mapChildren(children, function (child) {
  		    return child;
  		  }) || [];
  		}
  		/**
  		 * Returns the first child in a collection of children and verifies that there
  		 * is only one child in the collection.
  		 *
  		 * See https://reactjs.org/docs/react-api.html#reactchildrenonly
  		 *
  		 * The current implementation of this function assumes that a single child gets
  		 * passed without a wrapper, but the purpose of this helper function is to
  		 * abstract away the particular structure of children.
  		 *
  		 * @param {?object} children Child collection structure.
  		 * @return {ReactElement} The first and only `ReactElement` contained in the
  		 * structure.
  		 */


  		function onlyChild(children) {
  		  if (!isValidElement(children)) {
  		    throw new Error('React.Children.only expected to receive a single React element child.');
  		  }

  		  return children;
  		}

  		function createContext(defaultValue) {
  		  // TODO: Second argument used to be an optional `calculateChangedBits`
  		  // function. Warn to reserve for future use?
  		  var context = {
  		    $$typeof: REACT_CONTEXT_TYPE,
  		    // As a workaround to support multiple concurrent renderers, we categorize
  		    // some renderers as primary and others as secondary. We only expect
  		    // there to be two concurrent renderers at most: React Native (primary) and
  		    // Fabric (secondary); React DOM (primary) and React ART (secondary).
  		    // Secondary renderers store their context values on separate fields.
  		    _currentValue: defaultValue,
  		    _currentValue2: defaultValue,
  		    // Used to track how many concurrent renderers this context currently
  		    // supports within in a single renderer. Such as parallel server rendering.
  		    _threadCount: 0,
  		    // These are circular
  		    Provider: null,
  		    Consumer: null,
  		    // Add these to use same hidden class in VM as ServerContext
  		    _defaultValue: null,
  		    _globalName: null
  		  };
  		  context.Provider = {
  		    $$typeof: REACT_PROVIDER_TYPE,
  		    _context: context
  		  };
  		  var hasWarnedAboutUsingNestedContextConsumers = false;
  		  var hasWarnedAboutUsingConsumerProvider = false;
  		  var hasWarnedAboutDisplayNameOnConsumer = false;

  		  {
  		    // A separate object, but proxies back to the original context object for
  		    // backwards compatibility. It has a different $$typeof, so we can properly
  		    // warn for the incorrect usage of Context as a Consumer.
  		    var Consumer = {
  		      $$typeof: REACT_CONTEXT_TYPE,
  		      _context: context
  		    }; // $FlowFixMe: Flow complains about not setting a value, which is intentional here

  		    Object.defineProperties(Consumer, {
  		      Provider: {
  		        get: function () {
  		          if (!hasWarnedAboutUsingConsumerProvider) {
  		            hasWarnedAboutUsingConsumerProvider = true;

  		            error('Rendering <Context.Consumer.Provider> is not supported and will be removed in ' + 'a future major release. Did you mean to render <Context.Provider> instead?');
  		          }

  		          return context.Provider;
  		        },
  		        set: function (_Provider) {
  		          context.Provider = _Provider;
  		        }
  		      },
  		      _currentValue: {
  		        get: function () {
  		          return context._currentValue;
  		        },
  		        set: function (_currentValue) {
  		          context._currentValue = _currentValue;
  		        }
  		      },
  		      _currentValue2: {
  		        get: function () {
  		          return context._currentValue2;
  		        },
  		        set: function (_currentValue2) {
  		          context._currentValue2 = _currentValue2;
  		        }
  		      },
  		      _threadCount: {
  		        get: function () {
  		          return context._threadCount;
  		        },
  		        set: function (_threadCount) {
  		          context._threadCount = _threadCount;
  		        }
  		      },
  		      Consumer: {
  		        get: function () {
  		          if (!hasWarnedAboutUsingNestedContextConsumers) {
  		            hasWarnedAboutUsingNestedContextConsumers = true;

  		            error('Rendering <Context.Consumer.Consumer> is not supported and will be removed in ' + 'a future major release. Did you mean to render <Context.Consumer> instead?');
  		          }

  		          return context.Consumer;
  		        }
  		      },
  		      displayName: {
  		        get: function () {
  		          return context.displayName;
  		        },
  		        set: function (displayName) {
  		          if (!hasWarnedAboutDisplayNameOnConsumer) {
  		            warn('Setting `displayName` on Context.Consumer has no effect. ' + "You should set it directly on the context with Context.displayName = '%s'.", displayName);

  		            hasWarnedAboutDisplayNameOnConsumer = true;
  		          }
  		        }
  		      }
  		    }); // $FlowFixMe: Flow complains about missing properties because it doesn't understand defineProperty

  		    context.Consumer = Consumer;
  		  }

  		  {
  		    context._currentRenderer = null;
  		    context._currentRenderer2 = null;
  		  }

  		  return context;
  		}

  		var Uninitialized = -1;
  		var Pending = 0;
  		var Resolved = 1;
  		var Rejected = 2;

  		function lazyInitializer(payload) {
  		  if (payload._status === Uninitialized) {
  		    var ctor = payload._result;
  		    var thenable = ctor(); // Transition to the next state.
  		    // This might throw either because it's missing or throws. If so, we treat it
  		    // as still uninitialized and try again next time. Which is the same as what
  		    // happens if the ctor or any wrappers processing the ctor throws. This might
  		    // end up fixing it if the resolution was a concurrency bug.

  		    thenable.then(function (moduleObject) {
  		      if (payload._status === Pending || payload._status === Uninitialized) {
  		        // Transition to the next state.
  		        var resolved = payload;
  		        resolved._status = Resolved;
  		        resolved._result = moduleObject;
  		      }
  		    }, function (error) {
  		      if (payload._status === Pending || payload._status === Uninitialized) {
  		        // Transition to the next state.
  		        var rejected = payload;
  		        rejected._status = Rejected;
  		        rejected._result = error;
  		      }
  		    });

  		    if (payload._status === Uninitialized) {
  		      // In case, we're still uninitialized, then we're waiting for the thenable
  		      // to resolve. Set it as pending in the meantime.
  		      var pending = payload;
  		      pending._status = Pending;
  		      pending._result = thenable;
  		    }
  		  }

  		  if (payload._status === Resolved) {
  		    var moduleObject = payload._result;

  		    {
  		      if (moduleObject === undefined) {
  		        error('lazy: Expected the result of a dynamic imp' + 'ort() call. ' + 'Instead received: %s\n\nYour code should look like: \n  ' + // Break up imports to avoid accidentally parsing them as dependencies.
  		        'const MyComponent = lazy(() => imp' + "ort('./MyComponent'))\n\n" + 'Did you accidentally put curly braces around the import?', moduleObject);
  		      }
  		    }

  		    {
  		      if (!('default' in moduleObject)) {
  		        error('lazy: Expected the result of a dynamic imp' + 'ort() call. ' + 'Instead received: %s\n\nYour code should look like: \n  ' + // Break up imports to avoid accidentally parsing them as dependencies.
  		        'const MyComponent = lazy(() => imp' + "ort('./MyComponent'))", moduleObject);
  		      }
  		    }

  		    return moduleObject.default;
  		  } else {
  		    throw payload._result;
  		  }
  		}

  		function lazy(ctor) {
  		  var payload = {
  		    // We use these fields to store the result.
  		    _status: Uninitialized,
  		    _result: ctor
  		  };
  		  var lazyType = {
  		    $$typeof: REACT_LAZY_TYPE,
  		    _payload: payload,
  		    _init: lazyInitializer
  		  };

  		  {
  		    // In production, this would just set it on the object.
  		    var defaultProps;
  		    var propTypes; // $FlowFixMe

  		    Object.defineProperties(lazyType, {
  		      defaultProps: {
  		        configurable: true,
  		        get: function () {
  		          return defaultProps;
  		        },
  		        set: function (newDefaultProps) {
  		          error('React.lazy(...): It is not supported to assign `defaultProps` to ' + 'a lazy component import. Either specify them where the component ' + 'is defined, or create a wrapping component around it.');

  		          defaultProps = newDefaultProps; // Match production behavior more closely:
  		          // $FlowFixMe

  		          Object.defineProperty(lazyType, 'defaultProps', {
  		            enumerable: true
  		          });
  		        }
  		      },
  		      propTypes: {
  		        configurable: true,
  		        get: function () {
  		          return propTypes;
  		        },
  		        set: function (newPropTypes) {
  		          error('React.lazy(...): It is not supported to assign `propTypes` to ' + 'a lazy component import. Either specify them where the component ' + 'is defined, or create a wrapping component around it.');

  		          propTypes = newPropTypes; // Match production behavior more closely:
  		          // $FlowFixMe

  		          Object.defineProperty(lazyType, 'propTypes', {
  		            enumerable: true
  		          });
  		        }
  		      }
  		    });
  		  }

  		  return lazyType;
  		}

  		function forwardRef(render) {
  		  {
  		    if (render != null && render.$$typeof === REACT_MEMO_TYPE) {
  		      error('forwardRef requires a render function but received a `memo` ' + 'component. Instead of forwardRef(memo(...)), use ' + 'memo(forwardRef(...)).');
  		    } else if (typeof render !== 'function') {
  		      error('forwardRef requires a render function but was given %s.', render === null ? 'null' : typeof render);
  		    } else {
  		      if (render.length !== 0 && render.length !== 2) {
  		        error('forwardRef render functions accept exactly two parameters: props and ref. %s', render.length === 1 ? 'Did you forget to use the ref parameter?' : 'Any additional parameter will be undefined.');
  		      }
  		    }

  		    if (render != null) {
  		      if (render.defaultProps != null || render.propTypes != null) {
  		        error('forwardRef render functions do not support propTypes or defaultProps. ' + 'Did you accidentally pass a React component?');
  		      }
  		    }
  		  }

  		  var elementType = {
  		    $$typeof: REACT_FORWARD_REF_TYPE,
  		    render: render
  		  };

  		  {
  		    var ownName;
  		    Object.defineProperty(elementType, 'displayName', {
  		      enumerable: false,
  		      configurable: true,
  		      get: function () {
  		        return ownName;
  		      },
  		      set: function (name) {
  		        ownName = name; // The inner component shouldn't inherit this display name in most cases,
  		        // because the component may be used elsewhere.
  		        // But it's nice for anonymous functions to inherit the name,
  		        // so that our component-stack generation logic will display their frames.
  		        // An anonymous function generally suggests a pattern like:
  		        //   React.forwardRef((props, ref) => {...});
  		        // This kind of inner function is not used elsewhere so the side effect is okay.

  		        if (!render.name && !render.displayName) {
  		          render.displayName = name;
  		        }
  		      }
  		    });
  		  }

  		  return elementType;
  		}

  		var REACT_MODULE_REFERENCE;

  		{
  		  REACT_MODULE_REFERENCE = Symbol.for('react.module.reference');
  		}

  		function isValidElementType(type) {
  		  if (typeof type === 'string' || typeof type === 'function') {
  		    return true;
  		  } // Note: typeof might be other than 'symbol' or 'number' (e.g. if it's a polyfill).


  		  if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing  || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden  || type === REACT_OFFSCREEN_TYPE || enableScopeAPI  || enableCacheElement  || enableTransitionTracing ) {
  		    return true;
  		  }

  		  if (typeof type === 'object' && type !== null) {
  		    if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
  		    // types supported by any Flight configuration anywhere since
  		    // we don't know which Flight build this will end up being used
  		    // with.
  		    type.$$typeof === REACT_MODULE_REFERENCE || type.getModuleId !== undefined) {
  		      return true;
  		    }
  		  }

  		  return false;
  		}

  		function memo(type, compare) {
  		  {
  		    if (!isValidElementType(type)) {
  		      error('memo: The first argument must be a component. Instead ' + 'received: %s', type === null ? 'null' : typeof type);
  		    }
  		  }

  		  var elementType = {
  		    $$typeof: REACT_MEMO_TYPE,
  		    type: type,
  		    compare: compare === undefined ? null : compare
  		  };

  		  {
  		    var ownName;
  		    Object.defineProperty(elementType, 'displayName', {
  		      enumerable: false,
  		      configurable: true,
  		      get: function () {
  		        return ownName;
  		      },
  		      set: function (name) {
  		        ownName = name; // The inner component shouldn't inherit this display name in most cases,
  		        // because the component may be used elsewhere.
  		        // But it's nice for anonymous functions to inherit the name,
  		        // so that our component-stack generation logic will display their frames.
  		        // An anonymous function generally suggests a pattern like:
  		        //   React.memo((props) => {...});
  		        // This kind of inner function is not used elsewhere so the side effect is okay.

  		        if (!type.name && !type.displayName) {
  		          type.displayName = name;
  		        }
  		      }
  		    });
  		  }

  		  return elementType;
  		}

  		function resolveDispatcher() {
  		  var dispatcher = ReactCurrentDispatcher.current;

  		  {
  		    if (dispatcher === null) {
  		      error('Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for' + ' one of the following reasons:\n' + '1. You might have mismatching versions of React and the renderer (such as React DOM)\n' + '2. You might be breaking the Rules of Hooks\n' + '3. You might have more than one copy of React in the same app\n' + 'See https://reactjs.org/link/invalid-hook-call for tips about how to debug and fix this problem.');
  		    }
  		  } // Will result in a null access error if accessed outside render phase. We
  		  // intentionally don't throw our own error because this is in a hot path.
  		  // Also helps ensure this is inlined.


  		  return dispatcher;
  		}
  		function useContext(Context) {
  		  var dispatcher = resolveDispatcher();

  		  {
  		    // TODO: add a more generic warning for invalid values.
  		    if (Context._context !== undefined) {
  		      var realContext = Context._context; // Don't deduplicate because this legitimately causes bugs
  		      // and nobody should be using this in existing code.

  		      if (realContext.Consumer === Context) {
  		        error('Calling useContext(Context.Consumer) is not supported, may cause bugs, and will be ' + 'removed in a future major release. Did you mean to call useContext(Context) instead?');
  		      } else if (realContext.Provider === Context) {
  		        error('Calling useContext(Context.Provider) is not supported. ' + 'Did you mean to call useContext(Context) instead?');
  		      }
  		    }
  		  }

  		  return dispatcher.useContext(Context);
  		}
  		function useState(initialState) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useState(initialState);
  		}
  		function useReducer(reducer, initialArg, init) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useReducer(reducer, initialArg, init);
  		}
  		function useRef(initialValue) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useRef(initialValue);
  		}
  		function useEffect(create, deps) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useEffect(create, deps);
  		}
  		function useInsertionEffect(create, deps) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useInsertionEffect(create, deps);
  		}
  		function useLayoutEffect(create, deps) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useLayoutEffect(create, deps);
  		}
  		function useCallback(callback, deps) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useCallback(callback, deps);
  		}
  		function useMemo(create, deps) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useMemo(create, deps);
  		}
  		function useImperativeHandle(ref, create, deps) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useImperativeHandle(ref, create, deps);
  		}
  		function useDebugValue(value, formatterFn) {
  		  {
  		    var dispatcher = resolveDispatcher();
  		    return dispatcher.useDebugValue(value, formatterFn);
  		  }
  		}
  		function useTransition() {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useTransition();
  		}
  		function useDeferredValue(value) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useDeferredValue(value);
  		}
  		function useId() {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useId();
  		}
  		function useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
  		  var dispatcher = resolveDispatcher();
  		  return dispatcher.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  		}

  		// Helpers to patch console.logs to avoid logging during side-effect free
  		// replaying on render function. This currently only patches the object
  		// lazily which won't cover if the log function was extracted eagerly.
  		// We could also eagerly patch the method.
  		var disabledDepth = 0;
  		var prevLog;
  		var prevInfo;
  		var prevWarn;
  		var prevError;
  		var prevGroup;
  		var prevGroupCollapsed;
  		var prevGroupEnd;

  		function disabledLog() {}

  		disabledLog.__reactDisabledLog = true;
  		function disableLogs() {
  		  {
  		    if (disabledDepth === 0) {
  		      /* eslint-disable react-internal/no-production-logging */
  		      prevLog = console.log;
  		      prevInfo = console.info;
  		      prevWarn = console.warn;
  		      prevError = console.error;
  		      prevGroup = console.group;
  		      prevGroupCollapsed = console.groupCollapsed;
  		      prevGroupEnd = console.groupEnd; // https://github.com/facebook/react/issues/19099

  		      var props = {
  		        configurable: true,
  		        enumerable: true,
  		        value: disabledLog,
  		        writable: true
  		      }; // $FlowFixMe Flow thinks console is immutable.

  		      Object.defineProperties(console, {
  		        info: props,
  		        log: props,
  		        warn: props,
  		        error: props,
  		        group: props,
  		        groupCollapsed: props,
  		        groupEnd: props
  		      });
  		      /* eslint-enable react-internal/no-production-logging */
  		    }

  		    disabledDepth++;
  		  }
  		}
  		function reenableLogs() {
  		  {
  		    disabledDepth--;

  		    if (disabledDepth === 0) {
  		      /* eslint-disable react-internal/no-production-logging */
  		      var props = {
  		        configurable: true,
  		        enumerable: true,
  		        writable: true
  		      }; // $FlowFixMe Flow thinks console is immutable.

  		      Object.defineProperties(console, {
  		        log: assign({}, props, {
  		          value: prevLog
  		        }),
  		        info: assign({}, props, {
  		          value: prevInfo
  		        }),
  		        warn: assign({}, props, {
  		          value: prevWarn
  		        }),
  		        error: assign({}, props, {
  		          value: prevError
  		        }),
  		        group: assign({}, props, {
  		          value: prevGroup
  		        }),
  		        groupCollapsed: assign({}, props, {
  		          value: prevGroupCollapsed
  		        }),
  		        groupEnd: assign({}, props, {
  		          value: prevGroupEnd
  		        })
  		      });
  		      /* eslint-enable react-internal/no-production-logging */
  		    }

  		    if (disabledDepth < 0) {
  		      error('disabledDepth fell below zero. ' + 'This is a bug in React. Please file an issue.');
  		    }
  		  }
  		}

  		var ReactCurrentDispatcher$1 = ReactSharedInternals.ReactCurrentDispatcher;
  		var prefix;
  		function describeBuiltInComponentFrame(name, source, ownerFn) {
  		  {
  		    if (prefix === undefined) {
  		      // Extract the VM specific prefix used by each line.
  		      try {
  		        throw Error();
  		      } catch (x) {
  		        var match = x.stack.trim().match(/\n( *(at )?)/);
  		        prefix = match && match[1] || '';
  		      }
  		    } // We use the prefix to ensure our stacks line up with native stack frames.


  		    return '\n' + prefix + name;
  		  }
  		}
  		var reentry = false;
  		var componentFrameCache;

  		{
  		  var PossiblyWeakMap = typeof WeakMap === 'function' ? WeakMap : Map;
  		  componentFrameCache = new PossiblyWeakMap();
  		}

  		function describeNativeComponentFrame(fn, construct) {
  		  // If something asked for a stack inside a fake render, it should get ignored.
  		  if ( !fn || reentry) {
  		    return '';
  		  }

  		  {
  		    var frame = componentFrameCache.get(fn);

  		    if (frame !== undefined) {
  		      return frame;
  		    }
  		  }

  		  var control;
  		  reentry = true;
  		  var previousPrepareStackTrace = Error.prepareStackTrace; // $FlowFixMe It does accept undefined.

  		  Error.prepareStackTrace = undefined;
  		  var previousDispatcher;

  		  {
  		    previousDispatcher = ReactCurrentDispatcher$1.current; // Set the dispatcher in DEV because this might be call in the render function
  		    // for warnings.

  		    ReactCurrentDispatcher$1.current = null;
  		    disableLogs();
  		  }

  		  try {
  		    // This should throw.
  		    if (construct) {
  		      // Something should be setting the props in the constructor.
  		      var Fake = function () {
  		        throw Error();
  		      }; // $FlowFixMe


  		      Object.defineProperty(Fake.prototype, 'props', {
  		        set: function () {
  		          // We use a throwing setter instead of frozen or non-writable props
  		          // because that won't throw in a non-strict mode function.
  		          throw Error();
  		        }
  		      });

  		      if (typeof Reflect === 'object' && Reflect.construct) {
  		        // We construct a different control for this case to include any extra
  		        // frames added by the construct call.
  		        try {
  		          Reflect.construct(Fake, []);
  		        } catch (x) {
  		          control = x;
  		        }

  		        Reflect.construct(fn, [], Fake);
  		      } else {
  		        try {
  		          Fake.call();
  		        } catch (x) {
  		          control = x;
  		        }

  		        fn.call(Fake.prototype);
  		      }
  		    } else {
  		      try {
  		        throw Error();
  		      } catch (x) {
  		        control = x;
  		      }

  		      fn();
  		    }
  		  } catch (sample) {
  		    // This is inlined manually because closure doesn't do it for us.
  		    if (sample && control && typeof sample.stack === 'string') {
  		      // This extracts the first frame from the sample that isn't also in the control.
  		      // Skipping one frame that we assume is the frame that calls the two.
  		      var sampleLines = sample.stack.split('\n');
  		      var controlLines = control.stack.split('\n');
  		      var s = sampleLines.length - 1;
  		      var c = controlLines.length - 1;

  		      while (s >= 1 && c >= 0 && sampleLines[s] !== controlLines[c]) {
  		        // We expect at least one stack frame to be shared.
  		        // Typically this will be the root most one. However, stack frames may be
  		        // cut off due to maximum stack limits. In this case, one maybe cut off
  		        // earlier than the other. We assume that the sample is longer or the same
  		        // and there for cut off earlier. So we should find the root most frame in
  		        // the sample somewhere in the control.
  		        c--;
  		      }

  		      for (; s >= 1 && c >= 0; s--, c--) {
  		        // Next we find the first one that isn't the same which should be the
  		        // frame that called our sample function and the control.
  		        if (sampleLines[s] !== controlLines[c]) {
  		          // In V8, the first line is describing the message but other VMs don't.
  		          // If we're about to return the first line, and the control is also on the same
  		          // line, that's a pretty good indicator that our sample threw at same line as
  		          // the control. I.e. before we entered the sample frame. So we ignore this result.
  		          // This can happen if you passed a class to function component, or non-function.
  		          if (s !== 1 || c !== 1) {
  		            do {
  		              s--;
  		              c--; // We may still have similar intermediate frames from the construct call.
  		              // The next one that isn't the same should be our match though.

  		              if (c < 0 || sampleLines[s] !== controlLines[c]) {
  		                // V8 adds a "new" prefix for native classes. Let's remove it to make it prettier.
  		                var _frame = '\n' + sampleLines[s].replace(' at new ', ' at '); // If our component frame is labeled "<anonymous>"
  		                // but we have a user-provided "displayName"
  		                // splice it in to make the stack more readable.


  		                if (fn.displayName && _frame.includes('<anonymous>')) {
  		                  _frame = _frame.replace('<anonymous>', fn.displayName);
  		                }

  		                {
  		                  if (typeof fn === 'function') {
  		                    componentFrameCache.set(fn, _frame);
  		                  }
  		                } // Return the line we found.


  		                return _frame;
  		              }
  		            } while (s >= 1 && c >= 0);
  		          }

  		          break;
  		        }
  		      }
  		    }
  		  } finally {
  		    reentry = false;

  		    {
  		      ReactCurrentDispatcher$1.current = previousDispatcher;
  		      reenableLogs();
  		    }

  		    Error.prepareStackTrace = previousPrepareStackTrace;
  		  } // Fallback to just using the name if we couldn't make it throw.


  		  var name = fn ? fn.displayName || fn.name : '';
  		  var syntheticFrame = name ? describeBuiltInComponentFrame(name) : '';

  		  {
  		    if (typeof fn === 'function') {
  		      componentFrameCache.set(fn, syntheticFrame);
  		    }
  		  }

  		  return syntheticFrame;
  		}
  		function describeFunctionComponentFrame(fn, source, ownerFn) {
  		  {
  		    return describeNativeComponentFrame(fn, false);
  		  }
  		}

  		function shouldConstruct(Component) {
  		  var prototype = Component.prototype;
  		  return !!(prototype && prototype.isReactComponent);
  		}

  		function describeUnknownElementTypeFrameInDEV(type, source, ownerFn) {

  		  if (type == null) {
  		    return '';
  		  }

  		  if (typeof type === 'function') {
  		    {
  		      return describeNativeComponentFrame(type, shouldConstruct(type));
  		    }
  		  }

  		  if (typeof type === 'string') {
  		    return describeBuiltInComponentFrame(type);
  		  }

  		  switch (type) {
  		    case REACT_SUSPENSE_TYPE:
  		      return describeBuiltInComponentFrame('Suspense');

  		    case REACT_SUSPENSE_LIST_TYPE:
  		      return describeBuiltInComponentFrame('SuspenseList');
  		  }

  		  if (typeof type === 'object') {
  		    switch (type.$$typeof) {
  		      case REACT_FORWARD_REF_TYPE:
  		        return describeFunctionComponentFrame(type.render);

  		      case REACT_MEMO_TYPE:
  		        // Memo may contain any component type so we recursively resolve it.
  		        return describeUnknownElementTypeFrameInDEV(type.type, source, ownerFn);

  		      case REACT_LAZY_TYPE:
  		        {
  		          var lazyComponent = type;
  		          var payload = lazyComponent._payload;
  		          var init = lazyComponent._init;

  		          try {
  		            // Lazy may contain any component type so we recursively resolve it.
  		            return describeUnknownElementTypeFrameInDEV(init(payload), source, ownerFn);
  		          } catch (x) {}
  		        }
  		    }
  		  }

  		  return '';
  		}

  		var loggedTypeFailures = {};
  		var ReactDebugCurrentFrame$1 = ReactSharedInternals.ReactDebugCurrentFrame;

  		function setCurrentlyValidatingElement(element) {
  		  {
  		    if (element) {
  		      var owner = element._owner;
  		      var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
  		      ReactDebugCurrentFrame$1.setExtraStackFrame(stack);
  		    } else {
  		      ReactDebugCurrentFrame$1.setExtraStackFrame(null);
  		    }
  		  }
  		}

  		function checkPropTypes(typeSpecs, values, location, componentName, element) {
  		  {
  		    // $FlowFixMe This is okay but Flow doesn't know it.
  		    var has = Function.call.bind(hasOwnProperty);

  		    for (var typeSpecName in typeSpecs) {
  		      if (has(typeSpecs, typeSpecName)) {
  		        var error$1 = void 0; // Prop type validation may throw. In case they do, we don't want to
  		        // fail the render phase where it didn't fail before. So we log it.
  		        // After these have been cleaned up, we'll let them throw.

  		        try {
  		          // This is intentionally an invariant that gets caught. It's the same
  		          // behavior as without this statement except with a better message.
  		          if (typeof typeSpecs[typeSpecName] !== 'function') {
  		            // eslint-disable-next-line react-internal/prod-error-codes
  		            var err = Error((componentName || 'React class') + ': ' + location + ' type `' + typeSpecName + '` is invalid; ' + 'it must be a function, usually from the `prop-types` package, but received `' + typeof typeSpecs[typeSpecName] + '`.' + 'This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.');
  		            err.name = 'Invariant Violation';
  		            throw err;
  		          }

  		          error$1 = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, 'SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED');
  		        } catch (ex) {
  		          error$1 = ex;
  		        }

  		        if (error$1 && !(error$1 instanceof Error)) {
  		          setCurrentlyValidatingElement(element);

  		          error('%s: type specification of %s' + ' `%s` is invalid; the type checker ' + 'function must return `null` or an `Error` but returned a %s. ' + 'You may have forgotten to pass an argument to the type checker ' + 'creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and ' + 'shape all require an argument).', componentName || 'React class', location, typeSpecName, typeof error$1);

  		          setCurrentlyValidatingElement(null);
  		        }

  		        if (error$1 instanceof Error && !(error$1.message in loggedTypeFailures)) {
  		          // Only monitor this failure once because there tends to be a lot of the
  		          // same error.
  		          loggedTypeFailures[error$1.message] = true;
  		          setCurrentlyValidatingElement(element);

  		          error('Failed %s type: %s', location, error$1.message);

  		          setCurrentlyValidatingElement(null);
  		        }
  		      }
  		    }
  		  }
  		}

  		function setCurrentlyValidatingElement$1(element) {
  		  {
  		    if (element) {
  		      var owner = element._owner;
  		      var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
  		      setExtraStackFrame(stack);
  		    } else {
  		      setExtraStackFrame(null);
  		    }
  		  }
  		}

  		var propTypesMisspellWarningShown;

  		{
  		  propTypesMisspellWarningShown = false;
  		}

  		function getDeclarationErrorAddendum() {
  		  if (ReactCurrentOwner.current) {
  		    var name = getComponentNameFromType(ReactCurrentOwner.current.type);

  		    if (name) {
  		      return '\n\nCheck the render method of `' + name + '`.';
  		    }
  		  }

  		  return '';
  		}

  		function getSourceInfoErrorAddendum(source) {
  		  if (source !== undefined) {
  		    var fileName = source.fileName.replace(/^.*[\\\/]/, '');
  		    var lineNumber = source.lineNumber;
  		    return '\n\nCheck your code at ' + fileName + ':' + lineNumber + '.';
  		  }

  		  return '';
  		}

  		function getSourceInfoErrorAddendumForProps(elementProps) {
  		  if (elementProps !== null && elementProps !== undefined) {
  		    return getSourceInfoErrorAddendum(elementProps.__source);
  		  }

  		  return '';
  		}
  		/**
  		 * Warn if there's no key explicitly set on dynamic arrays of children or
  		 * object keys are not valid. This allows us to keep track of children between
  		 * updates.
  		 */


  		var ownerHasKeyUseWarning = {};

  		function getCurrentComponentErrorInfo(parentType) {
  		  var info = getDeclarationErrorAddendum();

  		  if (!info) {
  		    var parentName = typeof parentType === 'string' ? parentType : parentType.displayName || parentType.name;

  		    if (parentName) {
  		      info = "\n\nCheck the top-level render call using <" + parentName + ">.";
  		    }
  		  }

  		  return info;
  		}
  		/**
  		 * Warn if the element doesn't have an explicit key assigned to it.
  		 * This element is in an array. The array could grow and shrink or be
  		 * reordered. All children that haven't already been validated are required to
  		 * have a "key" property assigned to it. Error statuses are cached so a warning
  		 * will only be shown once.
  		 *
  		 * @internal
  		 * @param {ReactElement} element Element that requires a key.
  		 * @param {*} parentType element's parent's type.
  		 */


  		function validateExplicitKey(element, parentType) {
  		  if (!element._store || element._store.validated || element.key != null) {
  		    return;
  		  }

  		  element._store.validated = true;
  		  var currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);

  		  if (ownerHasKeyUseWarning[currentComponentErrorInfo]) {
  		    return;
  		  }

  		  ownerHasKeyUseWarning[currentComponentErrorInfo] = true; // Usually the current owner is the offender, but if it accepts children as a
  		  // property, it may be the creator of the child that's responsible for
  		  // assigning it a key.

  		  var childOwner = '';

  		  if (element && element._owner && element._owner !== ReactCurrentOwner.current) {
  		    // Give the component that originally created this child.
  		    childOwner = " It was passed a child from " + getComponentNameFromType(element._owner.type) + ".";
  		  }

  		  {
  		    setCurrentlyValidatingElement$1(element);

  		    error('Each child in a list should have a unique "key" prop.' + '%s%s See https://reactjs.org/link/warning-keys for more information.', currentComponentErrorInfo, childOwner);

  		    setCurrentlyValidatingElement$1(null);
  		  }
  		}
  		/**
  		 * Ensure that every element either is passed in a static location, in an
  		 * array with an explicit keys property defined, or in an object literal
  		 * with valid key property.
  		 *
  		 * @internal
  		 * @param {ReactNode} node Statically passed child of any type.
  		 * @param {*} parentType node's parent's type.
  		 */


  		function validateChildKeys(node, parentType) {
  		  if (typeof node !== 'object') {
  		    return;
  		  }

  		  if (isArray(node)) {
  		    for (var i = 0; i < node.length; i++) {
  		      var child = node[i];

  		      if (isValidElement(child)) {
  		        validateExplicitKey(child, parentType);
  		      }
  		    }
  		  } else if (isValidElement(node)) {
  		    // This element was passed in a valid location.
  		    if (node._store) {
  		      node._store.validated = true;
  		    }
  		  } else if (node) {
  		    var iteratorFn = getIteratorFn(node);

  		    if (typeof iteratorFn === 'function') {
  		      // Entry iterators used to provide implicit keys,
  		      // but now we print a separate warning for them later.
  		      if (iteratorFn !== node.entries) {
  		        var iterator = iteratorFn.call(node);
  		        var step;

  		        while (!(step = iterator.next()).done) {
  		          if (isValidElement(step.value)) {
  		            validateExplicitKey(step.value, parentType);
  		          }
  		        }
  		      }
  		    }
  		  }
  		}
  		/**
  		 * Given an element, validate that its props follow the propTypes definition,
  		 * provided by the type.
  		 *
  		 * @param {ReactElement} element
  		 */


  		function validatePropTypes(element) {
  		  {
  		    var type = element.type;

  		    if (type === null || type === undefined || typeof type === 'string') {
  		      return;
  		    }

  		    var propTypes;

  		    if (typeof type === 'function') {
  		      propTypes = type.propTypes;
  		    } else if (typeof type === 'object' && (type.$$typeof === REACT_FORWARD_REF_TYPE || // Note: Memo only checks outer props here.
  		    // Inner props are checked in the reconciler.
  		    type.$$typeof === REACT_MEMO_TYPE)) {
  		      propTypes = type.propTypes;
  		    } else {
  		      return;
  		    }

  		    if (propTypes) {
  		      // Intentionally inside to avoid triggering lazy initializers:
  		      var name = getComponentNameFromType(type);
  		      checkPropTypes(propTypes, element.props, 'prop', name, element);
  		    } else if (type.PropTypes !== undefined && !propTypesMisspellWarningShown) {
  		      propTypesMisspellWarningShown = true; // Intentionally inside to avoid triggering lazy initializers:

  		      var _name = getComponentNameFromType(type);

  		      error('Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?', _name || 'Unknown');
  		    }

  		    if (typeof type.getDefaultProps === 'function' && !type.getDefaultProps.isReactClassApproved) {
  		      error('getDefaultProps is only used on classic React.createClass ' + 'definitions. Use a static property named `defaultProps` instead.');
  		    }
  		  }
  		}
  		/**
  		 * Given a fragment, validate that it can only be provided with fragment props
  		 * @param {ReactElement} fragment
  		 */


  		function validateFragmentProps(fragment) {
  		  {
  		    var keys = Object.keys(fragment.props);

  		    for (var i = 0; i < keys.length; i++) {
  		      var key = keys[i];

  		      if (key !== 'children' && key !== 'key') {
  		        setCurrentlyValidatingElement$1(fragment);

  		        error('Invalid prop `%s` supplied to `React.Fragment`. ' + 'React.Fragment can only have `key` and `children` props.', key);

  		        setCurrentlyValidatingElement$1(null);
  		        break;
  		      }
  		    }

  		    if (fragment.ref !== null) {
  		      setCurrentlyValidatingElement$1(fragment);

  		      error('Invalid attribute `ref` supplied to `React.Fragment`.');

  		      setCurrentlyValidatingElement$1(null);
  		    }
  		  }
  		}
  		function createElementWithValidation(type, props, children) {
  		  var validType = isValidElementType(type); // We warn in this case but don't throw. We expect the element creation to
  		  // succeed and there will likely be errors in render.

  		  if (!validType) {
  		    var info = '';

  		    if (type === undefined || typeof type === 'object' && type !== null && Object.keys(type).length === 0) {
  		      info += ' You likely forgot to export your component from the file ' + "it's defined in, or you might have mixed up default and named imports.";
  		    }

  		    var sourceInfo = getSourceInfoErrorAddendumForProps(props);

  		    if (sourceInfo) {
  		      info += sourceInfo;
  		    } else {
  		      info += getDeclarationErrorAddendum();
  		    }

  		    var typeString;

  		    if (type === null) {
  		      typeString = 'null';
  		    } else if (isArray(type)) {
  		      typeString = 'array';
  		    } else if (type !== undefined && type.$$typeof === REACT_ELEMENT_TYPE) {
  		      typeString = "<" + (getComponentNameFromType(type.type) || 'Unknown') + " />";
  		      info = ' Did you accidentally export a JSX literal instead of a component?';
  		    } else {
  		      typeString = typeof type;
  		    }

  		    {
  		      error('React.createElement: type is invalid -- expected a string (for ' + 'built-in components) or a class/function (for composite ' + 'components) but got: %s.%s', typeString, info);
  		    }
  		  }

  		  var element = createElement.apply(this, arguments); // The result can be nullish if a mock or a custom function is used.
  		  // TODO: Drop this when these are no longer allowed as the type argument.

  		  if (element == null) {
  		    return element;
  		  } // Skip key warning if the type isn't valid since our key validation logic
  		  // doesn't expect a non-string/function type and can throw confusing errors.
  		  // We don't want exception behavior to differ between dev and prod.
  		  // (Rendering will throw with a helpful message and as soon as the type is
  		  // fixed, the key warnings will appear.)


  		  if (validType) {
  		    for (var i = 2; i < arguments.length; i++) {
  		      validateChildKeys(arguments[i], type);
  		    }
  		  }

  		  if (type === REACT_FRAGMENT_TYPE) {
  		    validateFragmentProps(element);
  		  } else {
  		    validatePropTypes(element);
  		  }

  		  return element;
  		}
  		var didWarnAboutDeprecatedCreateFactory = false;
  		function createFactoryWithValidation(type) {
  		  var validatedFactory = createElementWithValidation.bind(null, type);
  		  validatedFactory.type = type;

  		  {
  		    if (!didWarnAboutDeprecatedCreateFactory) {
  		      didWarnAboutDeprecatedCreateFactory = true;

  		      warn('React.createFactory() is deprecated and will be removed in ' + 'a future major release. Consider using JSX ' + 'or use React.createElement() directly instead.');
  		    } // Legacy hook: remove it


  		    Object.defineProperty(validatedFactory, 'type', {
  		      enumerable: false,
  		      get: function () {
  		        warn('Factory.type is deprecated. Access the class directly ' + 'before passing it to createFactory.');

  		        Object.defineProperty(this, 'type', {
  		          value: type
  		        });
  		        return type;
  		      }
  		    });
  		  }

  		  return validatedFactory;
  		}
  		function cloneElementWithValidation(element, props, children) {
  		  var newElement = cloneElement.apply(this, arguments);

  		  for (var i = 2; i < arguments.length; i++) {
  		    validateChildKeys(arguments[i], newElement.type);
  		  }

  		  validatePropTypes(newElement);
  		  return newElement;
  		}

  		function startTransition(scope, options) {
  		  var prevTransition = ReactCurrentBatchConfig.transition;
  		  ReactCurrentBatchConfig.transition = {};
  		  var currentTransition = ReactCurrentBatchConfig.transition;

  		  {
  		    ReactCurrentBatchConfig.transition._updatedFibers = new Set();
  		  }

  		  try {
  		    scope();
  		  } finally {
  		    ReactCurrentBatchConfig.transition = prevTransition;

  		    {
  		      if (prevTransition === null && currentTransition._updatedFibers) {
  		        var updatedFibersCount = currentTransition._updatedFibers.size;

  		        if (updatedFibersCount > 10) {
  		          warn('Detected a large number of updates inside startTransition. ' + 'If this is due to a subscription please re-write it to use React provided hooks. ' + 'Otherwise concurrent mode guarantees are off the table.');
  		        }

  		        currentTransition._updatedFibers.clear();
  		      }
  		    }
  		  }
  		}

  		var didWarnAboutMessageChannel = false;
  		var enqueueTaskImpl = null;
  		function enqueueTask(task) {
  		  if (enqueueTaskImpl === null) {
  		    try {
  		      // read require off the module object to get around the bundlers.
  		      // we don't want them to detect a require and bundle a Node polyfill.
  		      var requireString = ('require' + Math.random()).slice(0, 7);
  		      var nodeRequire = module && module[requireString]; // assuming we're in node, let's try to get node's
  		      // version of setImmediate, bypassing fake timers if any.

  		      enqueueTaskImpl = nodeRequire.call(module, 'timers').setImmediate;
  		    } catch (_err) {
  		      // we're in a browser
  		      // we can't use regular timers because they may still be faked
  		      // so we try MessageChannel+postMessage instead
  		      enqueueTaskImpl = function (callback) {
  		        {
  		          if (didWarnAboutMessageChannel === false) {
  		            didWarnAboutMessageChannel = true;

  		            if (typeof MessageChannel === 'undefined') {
  		              error('This browser does not have a MessageChannel implementation, ' + 'so enqueuing tasks via await act(async () => ...) will fail. ' + 'Please file an issue at https://github.com/facebook/react/issues ' + 'if you encounter this warning.');
  		            }
  		          }
  		        }

  		        var channel = new MessageChannel();
  		        channel.port1.onmessage = callback;
  		        channel.port2.postMessage(undefined);
  		      };
  		    }
  		  }

  		  return enqueueTaskImpl(task);
  		}

  		var actScopeDepth = 0;
  		var didWarnNoAwaitAct = false;
  		function act(callback) {
  		  {
  		    // `act` calls can be nested, so we track the depth. This represents the
  		    // number of `act` scopes on the stack.
  		    var prevActScopeDepth = actScopeDepth;
  		    actScopeDepth++;

  		    if (ReactCurrentActQueue.current === null) {
  		      // This is the outermost `act` scope. Initialize the queue. The reconciler
  		      // will detect the queue and use it instead of Scheduler.
  		      ReactCurrentActQueue.current = [];
  		    }

  		    var prevIsBatchingLegacy = ReactCurrentActQueue.isBatchingLegacy;
  		    var result;

  		    try {
  		      // Used to reproduce behavior of `batchedUpdates` in legacy mode. Only
  		      // set to `true` while the given callback is executed, not for updates
  		      // triggered during an async event, because this is how the legacy
  		      // implementation of `act` behaved.
  		      ReactCurrentActQueue.isBatchingLegacy = true;
  		      result = callback(); // Replicate behavior of original `act` implementation in legacy mode,
  		      // which flushed updates immediately after the scope function exits, even
  		      // if it's an async function.

  		      if (!prevIsBatchingLegacy && ReactCurrentActQueue.didScheduleLegacyUpdate) {
  		        var queue = ReactCurrentActQueue.current;

  		        if (queue !== null) {
  		          ReactCurrentActQueue.didScheduleLegacyUpdate = false;
  		          flushActQueue(queue);
  		        }
  		      }
  		    } catch (error) {
  		      popActScope(prevActScopeDepth);
  		      throw error;
  		    } finally {
  		      ReactCurrentActQueue.isBatchingLegacy = prevIsBatchingLegacy;
  		    }

  		    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
  		      var thenableResult = result; // The callback is an async function (i.e. returned a promise). Wait
  		      // for it to resolve before exiting the current scope.

  		      var wasAwaited = false;
  		      var thenable = {
  		        then: function (resolve, reject) {
  		          wasAwaited = true;
  		          thenableResult.then(function (returnValue) {
  		            popActScope(prevActScopeDepth);

  		            if (actScopeDepth === 0) {
  		              // We've exited the outermost act scope. Recursively flush the
  		              // queue until there's no remaining work.
  		              recursivelyFlushAsyncActWork(returnValue, resolve, reject);
  		            } else {
  		              resolve(returnValue);
  		            }
  		          }, function (error) {
  		            // The callback threw an error.
  		            popActScope(prevActScopeDepth);
  		            reject(error);
  		          });
  		        }
  		      };

  		      {
  		        if (!didWarnNoAwaitAct && typeof Promise !== 'undefined') {
  		          // eslint-disable-next-line no-undef
  		          Promise.resolve().then(function () {}).then(function () {
  		            if (!wasAwaited) {
  		              didWarnNoAwaitAct = true;

  		              error('You called act(async () => ...) without await. ' + 'This could lead to unexpected testing behaviour, ' + 'interleaving multiple act calls and mixing their ' + 'scopes. ' + 'You should - await act(async () => ...);');
  		            }
  		          });
  		        }
  		      }

  		      return thenable;
  		    } else {
  		      var returnValue = result; // The callback is not an async function. Exit the current scope
  		      // immediately, without awaiting.

  		      popActScope(prevActScopeDepth);

  		      if (actScopeDepth === 0) {
  		        // Exiting the outermost act scope. Flush the queue.
  		        var _queue = ReactCurrentActQueue.current;

  		        if (_queue !== null) {
  		          flushActQueue(_queue);
  		          ReactCurrentActQueue.current = null;
  		        } // Return a thenable. If the user awaits it, we'll flush again in
  		        // case additional work was scheduled by a microtask.


  		        var _thenable = {
  		          then: function (resolve, reject) {
  		            // Confirm we haven't re-entered another `act` scope, in case
  		            // the user does something weird like await the thenable
  		            // multiple times.
  		            if (ReactCurrentActQueue.current === null) {
  		              // Recursively flush the queue until there's no remaining work.
  		              ReactCurrentActQueue.current = [];
  		              recursivelyFlushAsyncActWork(returnValue, resolve, reject);
  		            } else {
  		              resolve(returnValue);
  		            }
  		          }
  		        };
  		        return _thenable;
  		      } else {
  		        // Since we're inside a nested `act` scope, the returned thenable
  		        // immediately resolves. The outer scope will flush the queue.
  		        var _thenable2 = {
  		          then: function (resolve, reject) {
  		            resolve(returnValue);
  		          }
  		        };
  		        return _thenable2;
  		      }
  		    }
  		  }
  		}

  		function popActScope(prevActScopeDepth) {
  		  {
  		    if (prevActScopeDepth !== actScopeDepth - 1) {
  		      error('You seem to have overlapping act() calls, this is not supported. ' + 'Be sure to await previous act() calls before making a new one. ');
  		    }

  		    actScopeDepth = prevActScopeDepth;
  		  }
  		}

  		function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
  		  {
  		    var queue = ReactCurrentActQueue.current;

  		    if (queue !== null) {
  		      try {
  		        flushActQueue(queue);
  		        enqueueTask(function () {
  		          if (queue.length === 0) {
  		            // No additional work was scheduled. Finish.
  		            ReactCurrentActQueue.current = null;
  		            resolve(returnValue);
  		          } else {
  		            // Keep flushing work until there's none left.
  		            recursivelyFlushAsyncActWork(returnValue, resolve, reject);
  		          }
  		        });
  		      } catch (error) {
  		        reject(error);
  		      }
  		    } else {
  		      resolve(returnValue);
  		    }
  		  }
  		}

  		var isFlushing = false;

  		function flushActQueue(queue) {
  		  {
  		    if (!isFlushing) {
  		      // Prevent re-entrance.
  		      isFlushing = true;
  		      var i = 0;

  		      try {
  		        for (; i < queue.length; i++) {
  		          var callback = queue[i];

  		          do {
  		            callback = callback(true);
  		          } while (callback !== null);
  		        }

  		        queue.length = 0;
  		      } catch (error) {
  		        // If something throws, leave the remaining callbacks on the queue.
  		        queue = queue.slice(i + 1);
  		        throw error;
  		      } finally {
  		        isFlushing = false;
  		      }
  		    }
  		  }
  		}

  		var createElement$1 =  createElementWithValidation ;
  		var cloneElement$1 =  cloneElementWithValidation ;
  		var createFactory =  createFactoryWithValidation ;
  		var Children = {
  		  map: mapChildren,
  		  forEach: forEachChildren,
  		  count: countChildren,
  		  toArray: toArray,
  		  only: onlyChild
  		};

  		exports.Children = Children;
  		exports.Component = Component;
  		exports.Fragment = REACT_FRAGMENT_TYPE;
  		exports.Profiler = REACT_PROFILER_TYPE;
  		exports.PureComponent = PureComponent;
  		exports.StrictMode = REACT_STRICT_MODE_TYPE;
  		exports.Suspense = REACT_SUSPENSE_TYPE;
  		exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals;
  		exports.cloneElement = cloneElement$1;
  		exports.createContext = createContext;
  		exports.createElement = createElement$1;
  		exports.createFactory = createFactory;
  		exports.createRef = createRef;
  		exports.forwardRef = forwardRef;
  		exports.isValidElement = isValidElement;
  		exports.lazy = lazy;
  		exports.memo = memo;
  		exports.startTransition = startTransition;
  		exports.unstable_act = act;
  		exports.useCallback = useCallback;
  		exports.useContext = useContext;
  		exports.useDebugValue = useDebugValue;
  		exports.useDeferredValue = useDeferredValue;
  		exports.useEffect = useEffect;
  		exports.useId = useId;
  		exports.useImperativeHandle = useImperativeHandle;
  		exports.useInsertionEffect = useInsertionEffect;
  		exports.useLayoutEffect = useLayoutEffect;
  		exports.useMemo = useMemo;
  		exports.useReducer = useReducer;
  		exports.useRef = useRef;
  		exports.useState = useState;
  		exports.useSyncExternalStore = useSyncExternalStore;
  		exports.useTransition = useTransition;
  		exports.version = ReactVersion;
  		          /* global __REACT_DEVTOOLS_GLOBAL_HOOK__ */
  		if (
  		  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined' &&
  		  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop ===
  		    'function'
  		) {
  		  __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(new Error());
  		}
  		        
  		  })();
  		} 
  	} (react_development, react_development.exports));
  	return react_development.exports;
  }

  if (process.env.NODE_ENV === 'production') {
    react.exports = requireReact_production_min();
  } else {
    react.exports = requireReact_development();
  }

  var reactExports = react.exports;
  var React = /*@__PURE__*/getDefaultExportFromCjs(reactExports);

  const Portals = ({ renderers }) => {
      return (React.createElement(React.Fragment, null, Object.entries(renderers).map(([key, renderer]) => {
          return ReactDOM.createPortal(renderer.reactElement, renderer.element, key);
      })));
  };
  class PureEditorContent extends React.Component {
      constructor(props) {
          super(props);
          this.editorContentRef = React.createRef();
          this.initialized = false;
          this.state = {
              renderers: {},
          };
      }
      componentDidMount() {
          this.init();
      }
      componentDidUpdate() {
          this.init();
      }
      init() {
          const { editor } = this.props;
          if (editor && editor.options.element) {
              if (editor.contentComponent) {
                  return;
              }
              const element = this.editorContentRef.current;
              element.append(...editor.options.element.childNodes);
              editor.setOptions({
                  element,
              });
              editor.contentComponent = this;
              editor.createNodeViews();
              this.initialized = true;
          }
      }
      maybeFlushSync(fn) {
          // Avoid calling flushSync until the editor is initialized.
          // Initialization happens during the componentDidMount or componentDidUpdate
          // lifecycle methods, and React doesn't allow calling flushSync from inside
          // a lifecycle method.
          if (this.initialized) {
              ReactDOM.flushSync(fn);
          }
          else {
              fn();
          }
      }
      setRenderer(id, renderer) {
          this.maybeFlushSync(() => {
              this.setState(({ renderers }) => ({
                  renderers: {
                      ...renderers,
                      [id]: renderer,
                  },
              }));
          });
      }
      removeRenderer(id) {
          this.maybeFlushSync(() => {
              this.setState(({ renderers }) => {
                  const nextRenderers = { ...renderers };
                  delete nextRenderers[id];
                  return { renderers: nextRenderers };
              });
          });
      }
      componentWillUnmount() {
          const { editor } = this.props;
          if (!editor) {
              return;
          }
          this.initialized = false;
          if (!editor.isDestroyed) {
              editor.view.setProps({
                  nodeViews: {},
              });
          }
          editor.contentComponent = null;
          if (!editor.options.element.firstChild) {
              return;
          }
          const newElement = document.createElement('div');
          newElement.append(...editor.options.element.childNodes);
          editor.setOptions({
              element: newElement,
          });
      }
      render() {
          const { editor, ...rest } = this.props;
          return (React.createElement(React.Fragment, null,
              React.createElement("div", { ref: this.editorContentRef, ...rest }),
              React.createElement(Portals, { renderers: this.state.renderers })));
      }
  }
  // EditorContent should be re-created whenever the Editor instance changes
  const EditorContentWithKey = (props) => {
      const key = React.useMemo(() => {
          return Math.floor(Math.random() * 0xFFFFFFFF).toString();
      }, [props.editor]);
      // Can't use JSX here because it conflicts with the type definition of Vue's JSX, so use createElement
      return React.createElement(PureEditorContent, { key, ...props });
  };
  React.memo(EditorContentWithKey);

  const EditorContext = reactExports.createContext({
      editor: null,
  });
  EditorContext.Consumer;

  const ReactNodeViewContext = reactExports.createContext({
      onDragStart: undefined,
  });
  const useReactNodeView = () => reactExports.useContext(ReactNodeViewContext);

  const NodeViewWrapper = React.forwardRef((props, ref) => {
      const { onDragStart } = useReactNodeView();
      const Tag = props.as || 'div';
      return (React.createElement(Tag, { ...props, ref: ref, "data-node-view-wrapper": "", onDragStart: onDragStart, style: {
              whiteSpace: 'normal',
              ...props.style,
          } }));
  });

  function isClassComponent(Component) {
      return !!(typeof Component === 'function'
          && Component.prototype
          && Component.prototype.isReactComponent);
  }
  function isForwardRefComponent(Component) {
      var _a;
      return !!(typeof Component === 'object'
          && ((_a = Component.$$typeof) === null || _a === void 0 ? void 0 : _a.toString()) === 'Symbol(react.forward_ref)');
  }
  class ReactRenderer {
      constructor(component, { editor, props = {}, as = 'div', className = '', attrs, }) {
          this.ref = null;
          this.id = Math.floor(Math.random() * 0xFFFFFFFF).toString();
          this.component = component;
          this.editor = editor;
          this.props = props;
          this.element = document.createElement(as);
          this.element.classList.add('react-renderer');
          if (className) {
              this.element.classList.add(...className.split(' '));
          }
          if (attrs) {
              Object.keys(attrs).forEach(key => {
                  this.element.setAttribute(key, attrs[key]);
              });
          }
          this.render();
      }
      render() {
          var _a, _b;
          const Component = this.component;
          const props = this.props;
          if (isClassComponent(Component) || isForwardRefComponent(Component)) {
              props.ref = (ref) => {
                  this.ref = ref;
              };
          }
          this.reactElement = React.createElement(Component, { ...props });
          (_b = (_a = this.editor) === null || _a === void 0 ? void 0 : _a.contentComponent) === null || _b === void 0 ? void 0 : _b.setRenderer(this.id, this);
      }
      updateProps(props = {}) {
          this.props = {
              ...this.props,
              ...props,
          };
          this.render();
      }
      destroy() {
          var _a, _b;
          (_b = (_a = this.editor) === null || _a === void 0 ? void 0 : _a.contentComponent) === null || _b === void 0 ? void 0 : _b.removeRenderer(this.id);
      }
  }

  class ReactNodeView extends NodeView {
      mount() {
          const props = {
              editor: this.editor,
              node: this.node,
              decorations: this.decorations,
              selected: false,
              extension: this.extension,
              getPos: () => this.getPos(),
              updateAttributes: (attributes = {}) => this.updateAttributes(attributes),
              deleteNode: () => this.deleteNode(),
          };
          if (!this.component.displayName) {
              const capitalizeFirstChar = (string) => {
                  return string.charAt(0).toUpperCase() + string.substring(1);
              };
              this.component.displayName = capitalizeFirstChar(this.extension.name);
          }
          const ReactNodeViewProvider = componentProps => {
              const Component = this.component;
              const onDragStart = this.onDragStart.bind(this);
              const nodeViewContentRef = element => {
                  if (element && this.contentDOMElement && element.firstChild !== this.contentDOMElement) {
                      element.appendChild(this.contentDOMElement);
                  }
              };
              return (React.createElement(React.Fragment, null,
                  React.createElement(ReactNodeViewContext.Provider, { value: { onDragStart, nodeViewContentRef } },
                      React.createElement(Component, { ...componentProps }))));
          };
          ReactNodeViewProvider.displayName = 'ReactNodeView';
          this.contentDOMElement = this.node.isLeaf
              ? null
              : document.createElement(this.node.isInline ? 'span' : 'div');
          if (this.contentDOMElement) {
              // For some reason the whiteSpace prop is not inherited properly in Chrome and Safari
              // With this fix it seems to work fine
              // See: https://github.com/ueberdosis/tiptap/issues/1197
              this.contentDOMElement.style.whiteSpace = 'inherit';
          }
          let as = this.node.isInline ? 'span' : 'div';
          if (this.options.as) {
              as = this.options.as;
          }
          const { className = '' } = this.options;
          this.handleSelectionUpdate = this.handleSelectionUpdate.bind(this);
          this.editor.on('selectionUpdate', this.handleSelectionUpdate);
          this.renderer = new ReactRenderer(ReactNodeViewProvider, {
              editor: this.editor,
              props,
              as,
              className: `node-${this.node.type.name} ${className}`.trim(),
              attrs: this.options.attrs,
          });
      }
      get dom() {
          var _a;
          if (this.renderer.element.firstElementChild
              && !((_a = this.renderer.element.firstElementChild) === null || _a === void 0 ? void 0 : _a.hasAttribute('data-node-view-wrapper'))) {
              throw Error('Please use the NodeViewWrapper component for your node view.');
          }
          return this.renderer.element;
      }
      get contentDOM() {
          if (this.node.isLeaf) {
              return null;
          }
          return this.contentDOMElement;
      }
      handleSelectionUpdate() {
          const { from, to } = this.editor.state.selection;
          if (from <= this.getPos() && to >= this.getPos() + this.node.nodeSize) {
              this.selectNode();
          }
          else {
              this.deselectNode();
          }
      }
      update(node, decorations) {
          const updateProps = (props) => {
              this.renderer.updateProps(props);
          };
          if (node.type !== this.node.type) {
              return false;
          }
          if (typeof this.options.update === 'function') {
              const oldNode = this.node;
              const oldDecorations = this.decorations;
              this.node = node;
              this.decorations = decorations;
              return this.options.update({
                  oldNode,
                  oldDecorations,
                  newNode: node,
                  newDecorations: decorations,
                  updateProps: () => updateProps({ node, decorations }),
              });
          }
          if (node === this.node && this.decorations === decorations) {
              return true;
          }
          this.node = node;
          this.decorations = decorations;
          updateProps({ node, decorations });
          return true;
      }
      selectNode() {
          this.renderer.updateProps({
              selected: true,
          });
      }
      deselectNode() {
          this.renderer.updateProps({
              selected: false,
          });
      }
      destroy() {
          this.renderer.destroy();
          this.editor.off('selectionUpdate', this.handleSelectionUpdate);
          this.contentDOMElement = null;
      }
  }
  function ReactNodeViewRenderer(component, options) {
      return (props) => {
          // try to get the parent component
          // this is important for vue devtools to show the component hierarchy correctly
          // maybe it’s `undefined` because <editor-content> isn’t rendered yet
          if (!props.editor.contentComponent) {
              return {};
          }
          return new ReactNodeView(component, props, options);
      };
  }

  var __extends$1 = (undefined && undefined.__extends) || (function () {
      var extendStatics = function (d, b) {
          extendStatics = Object.setPrototypeOf ||
              ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
              function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
          return extendStatics(d, b);
      };
      return function (d, b) {
          extendStatics(d, b);
          function __() { this.constructor = d; }
          d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
      };
  })();
  var __assign$1 = (undefined && undefined.__assign) || function () {
      __assign$1 = Object.assign || function(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
              s = arguments[i];
              for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                  t[p] = s[p];
          }
          return t;
      };
      return __assign$1.apply(this, arguments);
  };
  var rowSizeBase = {
      width: '100%',
      height: '10px',
      top: '0px',
      left: '0px',
      cursor: 'row-resize',
  };
  var colSizeBase = {
      width: '10px',
      height: '100%',
      top: '0px',
      left: '0px',
      cursor: 'col-resize',
  };
  var edgeBase = {
      width: '20px',
      height: '20px',
      position: 'absolute',
  };
  var styles = {
      top: __assign$1(__assign$1({}, rowSizeBase), { top: '-5px' }),
      right: __assign$1(__assign$1({}, colSizeBase), { left: undefined, right: '-5px' }),
      bottom: __assign$1(__assign$1({}, rowSizeBase), { top: undefined, bottom: '-5px' }),
      left: __assign$1(__assign$1({}, colSizeBase), { left: '-5px' }),
      topRight: __assign$1(__assign$1({}, edgeBase), { right: '-10px', top: '-10px', cursor: 'ne-resize' }),
      bottomRight: __assign$1(__assign$1({}, edgeBase), { right: '-10px', bottom: '-10px', cursor: 'se-resize' }),
      bottomLeft: __assign$1(__assign$1({}, edgeBase), { left: '-10px', bottom: '-10px', cursor: 'sw-resize' }),
      topLeft: __assign$1(__assign$1({}, edgeBase), { left: '-10px', top: '-10px', cursor: 'nw-resize' }),
  };
  var Resizer = /** @class */ (function (_super) {
      __extends$1(Resizer, _super);
      function Resizer() {
          var _this = _super !== null && _super.apply(this, arguments) || this;
          _this.onMouseDown = function (e) {
              _this.props.onResizeStart(e, _this.props.direction);
          };
          _this.onTouchStart = function (e) {
              _this.props.onResizeStart(e, _this.props.direction);
          };
          return _this;
      }
      Resizer.prototype.render = function () {
          return (reactExports.createElement("div", { className: this.props.className || '', style: __assign$1(__assign$1({ position: 'absolute', userSelect: 'none' }, styles[this.props.direction]), (this.props.replaceStyles || {})), onMouseDown: this.onMouseDown, onTouchStart: this.onTouchStart }, this.props.children));
      };
      return Resizer;
  }(reactExports.PureComponent));

  var __extends = (undefined && undefined.__extends) || (function () {
      var extendStatics = function (d, b) {
          extendStatics = Object.setPrototypeOf ||
              ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
              function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
          return extendStatics(d, b);
      };
      return function (d, b) {
          extendStatics(d, b);
          function __() { this.constructor = d; }
          d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
      };
  })();
  var __assign = (undefined && undefined.__assign) || function () {
      __assign = Object.assign || function(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
              s = arguments[i];
              for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                  t[p] = s[p];
          }
          return t;
      };
      return __assign.apply(this, arguments);
  };
  var DEFAULT_SIZE = {
      width: 'auto',
      height: 'auto',
  };
  var clamp = function (n, min, max) { return Math.max(Math.min(n, max), min); };
  var snap = function (n, size) { return Math.round(n / size) * size; };
  var hasDirection = function (dir, target) {
      return new RegExp(dir, 'i').test(target);
  };
  // INFO: In case of window is a Proxy and does not porxy Events correctly, use isTouchEvent & isMouseEvent to distinguish event type instead of `instanceof`.
  var isTouchEvent = function (event) {
      return Boolean(event.touches && event.touches.length);
  };
  var isMouseEvent = function (event) {
      return Boolean((event.clientX || event.clientX === 0) &&
          (event.clientY || event.clientY === 0));
  };
  var findClosestSnap = function (n, snapArray, snapGap) {
      if (snapGap === void 0) { snapGap = 0; }
      var closestGapIndex = snapArray.reduce(function (prev, curr, index) { return (Math.abs(curr - n) < Math.abs(snapArray[prev] - n) ? index : prev); }, 0);
      var gap = Math.abs(snapArray[closestGapIndex] - n);
      return snapGap === 0 || gap < snapGap ? snapArray[closestGapIndex] : n;
  };
  var getStringSize = function (n) {
      n = n.toString();
      if (n === 'auto') {
          return n;
      }
      if (n.endsWith('px')) {
          return n;
      }
      if (n.endsWith('%')) {
          return n;
      }
      if (n.endsWith('vh')) {
          return n;
      }
      if (n.endsWith('vw')) {
          return n;
      }
      if (n.endsWith('vmax')) {
          return n;
      }
      if (n.endsWith('vmin')) {
          return n;
      }
      return n + "px";
  };
  var getPixelSize = function (size, parentSize, innerWidth, innerHeight) {
      if (size && typeof size === 'string') {
          if (size.endsWith('px')) {
              return Number(size.replace('px', ''));
          }
          if (size.endsWith('%')) {
              var ratio = Number(size.replace('%', '')) / 100;
              return parentSize * ratio;
          }
          if (size.endsWith('vw')) {
              var ratio = Number(size.replace('vw', '')) / 100;
              return innerWidth * ratio;
          }
          if (size.endsWith('vh')) {
              var ratio = Number(size.replace('vh', '')) / 100;
              return innerHeight * ratio;
          }
      }
      return size;
  };
  var calculateNewMax = function (parentSize, innerWidth, innerHeight, maxWidth, maxHeight, minWidth, minHeight) {
      maxWidth = getPixelSize(maxWidth, parentSize.width, innerWidth, innerHeight);
      maxHeight = getPixelSize(maxHeight, parentSize.height, innerWidth, innerHeight);
      minWidth = getPixelSize(minWidth, parentSize.width, innerWidth, innerHeight);
      minHeight = getPixelSize(minHeight, parentSize.height, innerWidth, innerHeight);
      return {
          maxWidth: typeof maxWidth === 'undefined' ? undefined : Number(maxWidth),
          maxHeight: typeof maxHeight === 'undefined' ? undefined : Number(maxHeight),
          minWidth: typeof minWidth === 'undefined' ? undefined : Number(minWidth),
          minHeight: typeof minHeight === 'undefined' ? undefined : Number(minHeight),
      };
  };
  var definedProps = [
      'as',
      'style',
      'className',
      'grid',
      'snap',
      'bounds',
      'boundsByDirection',
      'size',
      'defaultSize',
      'minWidth',
      'minHeight',
      'maxWidth',
      'maxHeight',
      'lockAspectRatio',
      'lockAspectRatioExtraWidth',
      'lockAspectRatioExtraHeight',
      'enable',
      'handleStyles',
      'handleClasses',
      'handleWrapperStyle',
      'handleWrapperClass',
      'children',
      'onResizeStart',
      'onResize',
      'onResizeStop',
      'handleComponent',
      'scale',
      'resizeRatio',
      'snapGap',
  ];
  // HACK: This class is used to calculate % size.
  var baseClassName = '__resizable_base__';
  var Resizable = /** @class */ (function (_super) {
      __extends(Resizable, _super);
      function Resizable(props) {
          var _this = _super.call(this, props) || this;
          _this.ratio = 1;
          _this.resizable = null;
          // For parent boundary
          _this.parentLeft = 0;
          _this.parentTop = 0;
          // For boundary
          _this.resizableLeft = 0;
          _this.resizableRight = 0;
          _this.resizableTop = 0;
          _this.resizableBottom = 0;
          // For target boundary
          _this.targetLeft = 0;
          _this.targetTop = 0;
          _this.appendBase = function () {
              if (!_this.resizable || !_this.window) {
                  return null;
              }
              var parent = _this.parentNode;
              if (!parent) {
                  return null;
              }
              var element = _this.window.document.createElement('div');
              element.style.width = '100%';
              element.style.height = '100%';
              element.style.position = 'absolute';
              element.style.transform = 'scale(0, 0)';
              element.style.left = '0';
              element.style.flex = '0 0 100%';
              if (element.classList) {
                  element.classList.add(baseClassName);
              }
              else {
                  element.className += baseClassName;
              }
              parent.appendChild(element);
              return element;
          };
          _this.removeBase = function (base) {
              var parent = _this.parentNode;
              if (!parent) {
                  return;
              }
              parent.removeChild(base);
          };
          _this.ref = function (c) {
              if (c) {
                  _this.resizable = c;
              }
          };
          _this.state = {
              isResizing: false,
              width: typeof (_this.propsSize && _this.propsSize.width) === 'undefined'
                  ? 'auto'
                  : _this.propsSize && _this.propsSize.width,
              height: typeof (_this.propsSize && _this.propsSize.height) === 'undefined'
                  ? 'auto'
                  : _this.propsSize && _this.propsSize.height,
              direction: 'right',
              original: {
                  x: 0,
                  y: 0,
                  width: 0,
                  height: 0,
              },
              backgroundStyle: {
                  height: '100%',
                  width: '100%',
                  backgroundColor: 'rgba(0,0,0,0)',
                  cursor: 'auto',
                  opacity: 0,
                  position: 'fixed',
                  zIndex: 9999,
                  top: '0',
                  left: '0',
                  bottom: '0',
                  right: '0',
              },
              flexBasis: undefined,
          };
          _this.onResizeStart = _this.onResizeStart.bind(_this);
          _this.onMouseMove = _this.onMouseMove.bind(_this);
          _this.onMouseUp = _this.onMouseUp.bind(_this);
          return _this;
      }
      Object.defineProperty(Resizable.prototype, "parentNode", {
          get: function () {
              if (!this.resizable) {
                  return null;
              }
              return this.resizable.parentNode;
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(Resizable.prototype, "window", {
          get: function () {
              if (!this.resizable) {
                  return null;
              }
              if (!this.resizable.ownerDocument) {
                  return null;
              }
              return this.resizable.ownerDocument.defaultView;
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(Resizable.prototype, "propsSize", {
          get: function () {
              return this.props.size || this.props.defaultSize || DEFAULT_SIZE;
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(Resizable.prototype, "size", {
          get: function () {
              var width = 0;
              var height = 0;
              if (this.resizable && this.window) {
                  var orgWidth = this.resizable.offsetWidth;
                  var orgHeight = this.resizable.offsetHeight;
                  // HACK: Set position `relative` to get parent size.
                  //       This is because when re-resizable set `absolute`, I can not get base width correctly.
                  var orgPosition = this.resizable.style.position;
                  if (orgPosition !== 'relative') {
                      this.resizable.style.position = 'relative';
                  }
                  // INFO: Use original width or height if set auto.
                  width = this.resizable.style.width !== 'auto' ? this.resizable.offsetWidth : orgWidth;
                  height = this.resizable.style.height !== 'auto' ? this.resizable.offsetHeight : orgHeight;
                  // Restore original position
                  this.resizable.style.position = orgPosition;
              }
              return { width: width, height: height };
          },
          enumerable: false,
          configurable: true
      });
      Object.defineProperty(Resizable.prototype, "sizeStyle", {
          get: function () {
              var _this = this;
              var size = this.props.size;
              var getSize = function (key) {
                  if (typeof _this.state[key] === 'undefined' || _this.state[key] === 'auto') {
                      return 'auto';
                  }
                  if (_this.propsSize && _this.propsSize[key] && _this.propsSize[key].toString().endsWith('%')) {
                      if (_this.state[key].toString().endsWith('%')) {
                          return _this.state[key].toString();
                      }
                      var parentSize = _this.getParentSize();
                      var value = Number(_this.state[key].toString().replace('px', ''));
                      var percent = (value / parentSize[key]) * 100;
                      return percent + "%";
                  }
                  return getStringSize(_this.state[key]);
              };
              var width = size && typeof size.width !== 'undefined' && !this.state.isResizing
                  ? getStringSize(size.width)
                  : getSize('width');
              var height = size && typeof size.height !== 'undefined' && !this.state.isResizing
                  ? getStringSize(size.height)
                  : getSize('height');
              return { width: width, height: height };
          },
          enumerable: false,
          configurable: true
      });
      Resizable.prototype.getParentSize = function () {
          if (!this.parentNode) {
              if (!this.window) {
                  return { width: 0, height: 0 };
              }
              return { width: this.window.innerWidth, height: this.window.innerHeight };
          }
          var base = this.appendBase();
          if (!base) {
              return { width: 0, height: 0 };
          }
          // INFO: To calculate parent width with flex layout
          var wrapChanged = false;
          var wrap = this.parentNode.style.flexWrap;
          if (wrap !== 'wrap') {
              wrapChanged = true;
              this.parentNode.style.flexWrap = 'wrap';
              // HACK: Use relative to get parent padding size
          }
          base.style.position = 'relative';
          base.style.minWidth = '100%';
          base.style.minHeight = '100%';
          var size = {
              width: base.offsetWidth,
              height: base.offsetHeight,
          };
          if (wrapChanged) {
              this.parentNode.style.flexWrap = wrap;
          }
          this.removeBase(base);
          return size;
      };
      Resizable.prototype.bindEvents = function () {
          if (this.window) {
              this.window.addEventListener('mouseup', this.onMouseUp);
              this.window.addEventListener('mousemove', this.onMouseMove);
              this.window.addEventListener('mouseleave', this.onMouseUp);
              this.window.addEventListener('touchmove', this.onMouseMove, {
                  capture: true,
                  passive: false,
              });
              this.window.addEventListener('touchend', this.onMouseUp);
          }
      };
      Resizable.prototype.unbindEvents = function () {
          if (this.window) {
              this.window.removeEventListener('mouseup', this.onMouseUp);
              this.window.removeEventListener('mousemove', this.onMouseMove);
              this.window.removeEventListener('mouseleave', this.onMouseUp);
              this.window.removeEventListener('touchmove', this.onMouseMove, true);
              this.window.removeEventListener('touchend', this.onMouseUp);
          }
      };
      Resizable.prototype.componentDidMount = function () {
          if (!this.resizable || !this.window) {
              return;
          }
          var computedStyle = this.window.getComputedStyle(this.resizable);
          this.setState({
              width: this.state.width || this.size.width,
              height: this.state.height || this.size.height,
              flexBasis: computedStyle.flexBasis !== 'auto' ? computedStyle.flexBasis : undefined,
          });
      };
      Resizable.prototype.componentWillUnmount = function () {
          if (this.window) {
              this.unbindEvents();
          }
      };
      Resizable.prototype.createSizeForCssProperty = function (newSize, kind) {
          var propsSize = this.propsSize && this.propsSize[kind];
          return this.state[kind] === 'auto' &&
              this.state.original[kind] === newSize &&
              (typeof propsSize === 'undefined' || propsSize === 'auto')
              ? 'auto'
              : newSize;
      };
      Resizable.prototype.calculateNewMaxFromBoundary = function (maxWidth, maxHeight) {
          var boundsByDirection = this.props.boundsByDirection;
          var direction = this.state.direction;
          var widthByDirection = boundsByDirection && hasDirection('left', direction);
          var heightByDirection = boundsByDirection && hasDirection('top', direction);
          var boundWidth;
          var boundHeight;
          if (this.props.bounds === 'parent') {
              var parent_1 = this.parentNode;
              if (parent_1) {
                  boundWidth = widthByDirection
                      ? this.resizableRight - this.parentLeft
                      : parent_1.offsetWidth + (this.parentLeft - this.resizableLeft);
                  boundHeight = heightByDirection
                      ? this.resizableBottom - this.parentTop
                      : parent_1.offsetHeight + (this.parentTop - this.resizableTop);
              }
          }
          else if (this.props.bounds === 'window') {
              if (this.window) {
                  boundWidth = widthByDirection ? this.resizableRight : this.window.innerWidth - this.resizableLeft;
                  boundHeight = heightByDirection ? this.resizableBottom : this.window.innerHeight - this.resizableTop;
              }
          }
          else if (this.props.bounds) {
              boundWidth = widthByDirection
                  ? this.resizableRight - this.targetLeft
                  : this.props.bounds.offsetWidth + (this.targetLeft - this.resizableLeft);
              boundHeight = heightByDirection
                  ? this.resizableBottom - this.targetTop
                  : this.props.bounds.offsetHeight + (this.targetTop - this.resizableTop);
          }
          if (boundWidth && Number.isFinite(boundWidth)) {
              maxWidth = maxWidth && maxWidth < boundWidth ? maxWidth : boundWidth;
          }
          if (boundHeight && Number.isFinite(boundHeight)) {
              maxHeight = maxHeight && maxHeight < boundHeight ? maxHeight : boundHeight;
          }
          return { maxWidth: maxWidth, maxHeight: maxHeight };
      };
      Resizable.prototype.calculateNewSizeFromDirection = function (clientX, clientY) {
          var scale = this.props.scale || 1;
          var resizeRatio = this.props.resizeRatio || 1;
          var _a = this.state, direction = _a.direction, original = _a.original;
          var _b = this.props, lockAspectRatio = _b.lockAspectRatio, lockAspectRatioExtraHeight = _b.lockAspectRatioExtraHeight, lockAspectRatioExtraWidth = _b.lockAspectRatioExtraWidth;
          var newWidth = original.width;
          var newHeight = original.height;
          var extraHeight = lockAspectRatioExtraHeight || 0;
          var extraWidth = lockAspectRatioExtraWidth || 0;
          if (hasDirection('right', direction)) {
              newWidth = original.width + ((clientX - original.x) * resizeRatio) / scale;
              if (lockAspectRatio) {
                  newHeight = (newWidth - extraWidth) / this.ratio + extraHeight;
              }
          }
          if (hasDirection('left', direction)) {
              newWidth = original.width - ((clientX - original.x) * resizeRatio) / scale;
              if (lockAspectRatio) {
                  newHeight = (newWidth - extraWidth) / this.ratio + extraHeight;
              }
          }
          if (hasDirection('bottom', direction)) {
              newHeight = original.height + ((clientY - original.y) * resizeRatio) / scale;
              if (lockAspectRatio) {
                  newWidth = (newHeight - extraHeight) * this.ratio + extraWidth;
              }
          }
          if (hasDirection('top', direction)) {
              newHeight = original.height - ((clientY - original.y) * resizeRatio) / scale;
              if (lockAspectRatio) {
                  newWidth = (newHeight - extraHeight) * this.ratio + extraWidth;
              }
          }
          return { newWidth: newWidth, newHeight: newHeight };
      };
      Resizable.prototype.calculateNewSizeFromAspectRatio = function (newWidth, newHeight, max, min) {
          var _a = this.props, lockAspectRatio = _a.lockAspectRatio, lockAspectRatioExtraHeight = _a.lockAspectRatioExtraHeight, lockAspectRatioExtraWidth = _a.lockAspectRatioExtraWidth;
          var computedMinWidth = typeof min.width === 'undefined' ? 10 : min.width;
          var computedMaxWidth = typeof max.width === 'undefined' || max.width < 0 ? newWidth : max.width;
          var computedMinHeight = typeof min.height === 'undefined' ? 10 : min.height;
          var computedMaxHeight = typeof max.height === 'undefined' || max.height < 0 ? newHeight : max.height;
          var extraHeight = lockAspectRatioExtraHeight || 0;
          var extraWidth = lockAspectRatioExtraWidth || 0;
          if (lockAspectRatio) {
              var extraMinWidth = (computedMinHeight - extraHeight) * this.ratio + extraWidth;
              var extraMaxWidth = (computedMaxHeight - extraHeight) * this.ratio + extraWidth;
              var extraMinHeight = (computedMinWidth - extraWidth) / this.ratio + extraHeight;
              var extraMaxHeight = (computedMaxWidth - extraWidth) / this.ratio + extraHeight;
              var lockedMinWidth = Math.max(computedMinWidth, extraMinWidth);
              var lockedMaxWidth = Math.min(computedMaxWidth, extraMaxWidth);
              var lockedMinHeight = Math.max(computedMinHeight, extraMinHeight);
              var lockedMaxHeight = Math.min(computedMaxHeight, extraMaxHeight);
              newWidth = clamp(newWidth, lockedMinWidth, lockedMaxWidth);
              newHeight = clamp(newHeight, lockedMinHeight, lockedMaxHeight);
          }
          else {
              newWidth = clamp(newWidth, computedMinWidth, computedMaxWidth);
              newHeight = clamp(newHeight, computedMinHeight, computedMaxHeight);
          }
          return { newWidth: newWidth, newHeight: newHeight };
      };
      Resizable.prototype.setBoundingClientRect = function () {
          // For parent boundary
          if (this.props.bounds === 'parent') {
              var parent_2 = this.parentNode;
              if (parent_2) {
                  var parentRect = parent_2.getBoundingClientRect();
                  this.parentLeft = parentRect.left;
                  this.parentTop = parentRect.top;
              }
          }
          // For target(html element) boundary
          if (this.props.bounds && typeof this.props.bounds !== 'string') {
              var targetRect = this.props.bounds.getBoundingClientRect();
              this.targetLeft = targetRect.left;
              this.targetTop = targetRect.top;
          }
          // For boundary
          if (this.resizable) {
              var _a = this.resizable.getBoundingClientRect(), left = _a.left, top_1 = _a.top, right = _a.right, bottom = _a.bottom;
              this.resizableLeft = left;
              this.resizableRight = right;
              this.resizableTop = top_1;
              this.resizableBottom = bottom;
          }
      };
      Resizable.prototype.onResizeStart = function (event, direction) {
          if (!this.resizable || !this.window) {
              return;
          }
          var clientX = 0;
          var clientY = 0;
          if (event.nativeEvent && isMouseEvent(event.nativeEvent)) {
              clientX = event.nativeEvent.clientX;
              clientY = event.nativeEvent.clientY;
          }
          else if (event.nativeEvent && isTouchEvent(event.nativeEvent)) {
              clientX = event.nativeEvent.touches[0].clientX;
              clientY = event.nativeEvent.touches[0].clientY;
          }
          if (this.props.onResizeStart) {
              if (this.resizable) {
                  var startResize = this.props.onResizeStart(event, direction, this.resizable);
                  if (startResize === false) {
                      return;
                  }
              }
          }
          // Fix #168
          if (this.props.size) {
              if (typeof this.props.size.height !== 'undefined' && this.props.size.height !== this.state.height) {
                  this.setState({ height: this.props.size.height });
              }
              if (typeof this.props.size.width !== 'undefined' && this.props.size.width !== this.state.width) {
                  this.setState({ width: this.props.size.width });
              }
          }
          // For lockAspectRatio case
          this.ratio =
              typeof this.props.lockAspectRatio === 'number' ? this.props.lockAspectRatio : this.size.width / this.size.height;
          var flexBasis;
          var computedStyle = this.window.getComputedStyle(this.resizable);
          if (computedStyle.flexBasis !== 'auto') {
              var parent_3 = this.parentNode;
              if (parent_3) {
                  var dir = this.window.getComputedStyle(parent_3).flexDirection;
                  this.flexDir = dir.startsWith('row') ? 'row' : 'column';
                  flexBasis = computedStyle.flexBasis;
              }
          }
          // For boundary
          this.setBoundingClientRect();
          this.bindEvents();
          var state = {
              original: {
                  x: clientX,
                  y: clientY,
                  width: this.size.width,
                  height: this.size.height,
              },
              isResizing: true,
              backgroundStyle: __assign(__assign({}, this.state.backgroundStyle), { cursor: this.window.getComputedStyle(event.target).cursor || 'auto' }),
              direction: direction,
              flexBasis: flexBasis,
          };
          this.setState(state);
      };
      Resizable.prototype.onMouseMove = function (event) {
          var _this = this;
          if (!this.state.isResizing || !this.resizable || !this.window) {
              return;
          }
          if (this.window.TouchEvent && isTouchEvent(event)) {
              try {
                  event.preventDefault();
                  event.stopPropagation();
              }
              catch (e) {
                  // Ignore on fail
              }
          }
          var _a = this.props, maxWidth = _a.maxWidth, maxHeight = _a.maxHeight, minWidth = _a.minWidth, minHeight = _a.minHeight;
          var clientX = isTouchEvent(event) ? event.touches[0].clientX : event.clientX;
          var clientY = isTouchEvent(event) ? event.touches[0].clientY : event.clientY;
          var _b = this.state, direction = _b.direction, original = _b.original, width = _b.width, height = _b.height;
          var parentSize = this.getParentSize();
          var max = calculateNewMax(parentSize, this.window.innerWidth, this.window.innerHeight, maxWidth, maxHeight, minWidth, minHeight);
          maxWidth = max.maxWidth;
          maxHeight = max.maxHeight;
          minWidth = max.minWidth;
          minHeight = max.minHeight;
          // Calculate new size
          var _c = this.calculateNewSizeFromDirection(clientX, clientY), newHeight = _c.newHeight, newWidth = _c.newWidth;
          // Calculate max size from boundary settings
          var boundaryMax = this.calculateNewMaxFromBoundary(maxWidth, maxHeight);
          if (this.props.snap && this.props.snap.x) {
              newWidth = findClosestSnap(newWidth, this.props.snap.x, this.props.snapGap);
          }
          if (this.props.snap && this.props.snap.y) {
              newHeight = findClosestSnap(newHeight, this.props.snap.y, this.props.snapGap);
          }
          // Calculate new size from aspect ratio
          var newSize = this.calculateNewSizeFromAspectRatio(newWidth, newHeight, { width: boundaryMax.maxWidth, height: boundaryMax.maxHeight }, { width: minWidth, height: minHeight });
          newWidth = newSize.newWidth;
          newHeight = newSize.newHeight;
          if (this.props.grid) {
              var newGridWidth = snap(newWidth, this.props.grid[0]);
              var newGridHeight = snap(newHeight, this.props.grid[1]);
              var gap = this.props.snapGap || 0;
              newWidth = gap === 0 || Math.abs(newGridWidth - newWidth) <= gap ? newGridWidth : newWidth;
              newHeight = gap === 0 || Math.abs(newGridHeight - newHeight) <= gap ? newGridHeight : newHeight;
          }
          var delta = {
              width: newWidth - original.width,
              height: newHeight - original.height,
          };
          if (width && typeof width === 'string') {
              if (width.endsWith('%')) {
                  var percent = (newWidth / parentSize.width) * 100;
                  newWidth = percent + "%";
              }
              else if (width.endsWith('vw')) {
                  var vw = (newWidth / this.window.innerWidth) * 100;
                  newWidth = vw + "vw";
              }
              else if (width.endsWith('vh')) {
                  var vh = (newWidth / this.window.innerHeight) * 100;
                  newWidth = vh + "vh";
              }
          }
          if (height && typeof height === 'string') {
              if (height.endsWith('%')) {
                  var percent = (newHeight / parentSize.height) * 100;
                  newHeight = percent + "%";
              }
              else if (height.endsWith('vw')) {
                  var vw = (newHeight / this.window.innerWidth) * 100;
                  newHeight = vw + "vw";
              }
              else if (height.endsWith('vh')) {
                  var vh = (newHeight / this.window.innerHeight) * 100;
                  newHeight = vh + "vh";
              }
          }
          var newState = {
              width: this.createSizeForCssProperty(newWidth, 'width'),
              height: this.createSizeForCssProperty(newHeight, 'height'),
          };
          if (this.flexDir === 'row') {
              newState.flexBasis = newState.width;
          }
          else if (this.flexDir === 'column') {
              newState.flexBasis = newState.height;
          }
          // For v18, update state sync
          ReactDOM.flushSync(function () {
              _this.setState(newState);
          });
          if (this.props.onResize) {
              this.props.onResize(event, direction, this.resizable, delta);
          }
      };
      Resizable.prototype.onMouseUp = function (event) {
          var _a = this.state, isResizing = _a.isResizing, direction = _a.direction, original = _a.original;
          if (!isResizing || !this.resizable) {
              return;
          }
          var delta = {
              width: this.size.width - original.width,
              height: this.size.height - original.height,
          };
          if (this.props.onResizeStop) {
              this.props.onResizeStop(event, direction, this.resizable, delta);
          }
          if (this.props.size) {
              this.setState(this.props.size);
          }
          this.unbindEvents();
          this.setState({
              isResizing: false,
              backgroundStyle: __assign(__assign({}, this.state.backgroundStyle), { cursor: 'auto' }),
          });
      };
      Resizable.prototype.updateSize = function (size) {
          this.setState({ width: size.width, height: size.height });
      };
      Resizable.prototype.renderResizer = function () {
          var _this = this;
          var _a = this.props, enable = _a.enable, handleStyles = _a.handleStyles, handleClasses = _a.handleClasses, handleWrapperStyle = _a.handleWrapperStyle, handleWrapperClass = _a.handleWrapperClass, handleComponent = _a.handleComponent;
          if (!enable) {
              return null;
          }
          var resizers = Object.keys(enable).map(function (dir) {
              if (enable[dir] !== false) {
                  return (reactExports.createElement(Resizer, { key: dir, direction: dir, onResizeStart: _this.onResizeStart, replaceStyles: handleStyles && handleStyles[dir], className: handleClasses && handleClasses[dir] }, handleComponent && handleComponent[dir] ? handleComponent[dir] : null));
              }
              return null;
          });
          // #93 Wrap the resize box in span (will not break 100% width/height)
          return (reactExports.createElement("div", { className: handleWrapperClass, style: handleWrapperStyle }, resizers));
      };
      Resizable.prototype.render = function () {
          var _this = this;
          var extendsProps = Object.keys(this.props).reduce(function (acc, key) {
              if (definedProps.indexOf(key) !== -1) {
                  return acc;
              }
              acc[key] = _this.props[key];
              return acc;
          }, {});
          var style = __assign(__assign(__assign({ position: 'relative', userSelect: this.state.isResizing ? 'none' : 'auto' }, this.props.style), this.sizeStyle), { maxWidth: this.props.maxWidth, maxHeight: this.props.maxHeight, minWidth: this.props.minWidth, minHeight: this.props.minHeight, boxSizing: 'border-box', flexShrink: 0 });
          if (this.state.flexBasis) {
              style.flexBasis = this.state.flexBasis;
          }
          var Wrapper = this.props.as || 'div';
          return (reactExports.createElement(Wrapper, __assign({ ref: this.ref, style: style, className: this.props.className }, extendsProps),
              this.state.isResizing && reactExports.createElement("div", { style: this.state.backgroundStyle }),
              this.props.children,
              this.renderResizer()));
      };
      Resizable.defaultProps = {
          as: 'div',
          onResizeStart: function () { },
          onResize: function () { },
          onResizeStop: function () { },
          enable: {
              top: true,
              right: true,
              bottom: true,
              left: true,
              topRight: true,
              bottomRight: true,
              bottomLeft: true,
              topLeft: true,
          },
          style: {},
          grid: [1, 1],
          lockAspectRatio: false,
          lockAspectRatioExtraWidth: 0,
          lockAspectRatioExtraHeight: 0,
          scale: 1,
          resizeRatio: 1,
          snapGap: 0,
      };
      return Resizable;
  }(reactExports.PureComponent));

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
          const attributes = {
              ...HTMLAttributes,
              style: `height: ${height} !important; width: ${width} !important;`,
          };
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

  return ResizableImage;

}));
//# sourceMappingURL=index.umd.js.map
