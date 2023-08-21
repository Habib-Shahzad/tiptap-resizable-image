(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('@tiptap/pm/state'), require('@tiptap/pm/view'), require('@tiptap/pm/keymap'), require('@tiptap/pm/model'), require('@tiptap/pm/transform'), require('@tiptap/pm/commands'), require('@tiptap/pm/schema-list'), require('react'), require('react-dom')) :
  typeof define === 'function' && define.amd ? define(['@tiptap/pm/state', '@tiptap/pm/view', '@tiptap/pm/keymap', '@tiptap/pm/model', '@tiptap/pm/transform', '@tiptap/pm/commands', '@tiptap/pm/schema-list', 'react', 'react-dom'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.typescriptNpmPackage = factory(global.state, null, null, global.model, global.transform, global.commands$1, global.schemaList, global.React, global.ReactDOM));
})(this, (function (state, view, keymap, model, transform, commands$1, schemaList, React, ReactDOM) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
        }
      });
    }
    n["default"] = e;
    return Object.freeze(n);
  }

  var React__default = /*#__PURE__*/_interopDefaultLegacy(React);
  var React__namespace = /*#__PURE__*/_interopNamespace(React);
  var ReactDOM__default = /*#__PURE__*/_interopDefaultLegacy(ReactDOM);

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

  const Portals = ({ renderers }) => {
      return (React__default["default"].createElement(React__default["default"].Fragment, null, Object.entries(renderers).map(([key, renderer]) => {
          return ReactDOM__default["default"].createPortal(renderer.reactElement, renderer.element, key);
      })));
  };
  class PureEditorContent extends React__default["default"].Component {
      constructor(props) {
          super(props);
          this.editorContentRef = React__default["default"].createRef();
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
          return (React__default["default"].createElement(React__default["default"].Fragment, null,
              React__default["default"].createElement("div", { ref: this.editorContentRef, ...rest }),
              React__default["default"].createElement(Portals, { renderers: this.state.renderers })));
      }
  }
  // EditorContent should be re-created whenever the Editor instance changes
  const EditorContentWithKey = (props) => {
      const key = React__default["default"].useMemo(() => {
          return Math.floor(Math.random() * 0xFFFFFFFF).toString();
      }, [props.editor]);
      // Can't use JSX here because it conflicts with the type definition of Vue's JSX, so use createElement
      return React__default["default"].createElement(PureEditorContent, { key, ...props });
  };
  React__default["default"].memo(EditorContentWithKey);

  const EditorContext = React.createContext({
      editor: null,
  });
  EditorContext.Consumer;

  const ReactNodeViewContext = React.createContext({
      onDragStart: undefined,
  });
  const useReactNodeView = () => React.useContext(ReactNodeViewContext);

  const NodeViewWrapper = React__default["default"].forwardRef((props, ref) => {
      const { onDragStart } = useReactNodeView();
      const Tag = props.as || 'div';
      return (React__default["default"].createElement(Tag, { ...props, ref: ref, "data-node-view-wrapper": "", onDragStart: onDragStart, style: {
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
          this.reactElement = React__default["default"].createElement(Component, { ...props });
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
              return (React__default["default"].createElement(React__default["default"].Fragment, null,
                  React__default["default"].createElement(ReactNodeViewContext.Provider, { value: { onDragStart, nodeViewContentRef } },
                      React__default["default"].createElement(Component, { ...componentProps }))));
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
          return (React__namespace.createElement("div", { className: this.props.className || '', style: __assign$1(__assign$1({ position: 'absolute', userSelect: 'none' }, styles[this.props.direction]), (this.props.replaceStyles || {})), onMouseDown: this.onMouseDown, onTouchStart: this.onTouchStart }, this.props.children));
      };
      return Resizer;
  }(React__namespace.PureComponent));

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
                  return (React__namespace.createElement(Resizer, { key: dir, direction: dir, onResizeStart: _this.onResizeStart, replaceStyles: handleStyles && handleStyles[dir], className: handleClasses && handleClasses[dir] }, handleComponent && handleComponent[dir] ? handleComponent[dir] : null));
              }
              return null;
          });
          // #93 Wrap the resize box in span (will not break 100% width/height)
          return (React__namespace.createElement("div", { className: handleWrapperClass, style: handleWrapperStyle }, resizers));
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
          return (React__namespace.createElement(Wrapper, __assign({ ref: this.ref, style: style, className: this.props.className }, extendsProps),
              this.state.isResizing && React__namespace.createElement("div", { style: this.state.backgroundStyle }),
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
  }(React__namespace.PureComponent));

  function ResizableImageWrapper(props) {
      return (React__default["default"].createElement(NodeViewWrapper, { className: "image-resizer" },
          React__default["default"].createElement(Resizable, { defaultSize: {
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

  return ResizableImage;

}));
//# sourceMappingURL=tiptap-resize-image.js.map
