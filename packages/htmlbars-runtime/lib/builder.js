import { assert } from "../htmlbars-util";
import { struct } from "../htmlbars-util/object-utils";
import * as types from "../htmlbars-util/object-utils";

export const BuilderResult = struct({
  morphs: types.ARRAY,
  statements: types.ARRAY
});

export default class Builder {
  constructor(renderNode, { env, scope, visitor }) {
    // REFACTOR TODO: Runtime is { env, scope, visitor }?
    this.env = env;
    this.dom = env.dom;
    this.scope = scope;
    this.visitor = visitor;

    this.renderNode = renderNode;
    this.contextualElement = this.originalContextualElement = renderNode.contextualElement;

    this.elementStack = [];
    // REFACTOR TODO: Allocate the right size for this?
    this.morphs = [];
    this.statements = [];
  }

  createChild(morph) {
    return new Builder(morph, { env: this.env, scope: this.scope, visitor: this.visitor });
  }

  evaluateTemplate(template) {
    template.statements.forEach(statement => statement.render(this, this.dom));
  }

  /// Utilities

  openElement(tag) {
    let element = this.dom.createElement(tag, this.contextualElement);
    this.pushElement(element);
    return element;
  }

  closeElement() {
    this.appendChild(this.popElement());
  }

  createMorph(statement, unsafe) {
    let morph = new this.dom.MorphClass(this.dom, this.contextualElement);
    morph.ownerNode = this.renderNode.ownerNode;
    morph.parentMorph = this.renderNode;
    morph.frontBoundary = statement.frontBoundary;
    morph.backBoundary = statement.backBoundary;
    morph.appendToParent = this.element || this.renderNode.appendToParent;
    morph.nextSibling = this.element ? null : this.renderNode.nextSiblingNode();
    morph.parseTextAsHTML = !!unsafe;
    this.morphs.push(morph);
    return morph;
  }

  createAttrMorph(name, namespace) {
    assert(this.element, "createAttrMorph() requires an element");
    let morph = this.dom.createAttrMorph(this.element, name, namespace);
    this.morphs.push(morph);
    return morph;
  }

  appendChild(node) {
    if (this.element) {
      this.dom.appendChild(this.element, node);
    } else {
      this.renderNode.appendNode(node);
    }
  }

  evaluateStatement(statement, morph) {
    statement.evaluate(morph, this.env, this.scope, this.visitor, this);
    this.statements.push(statement);
    if (morph.nodeEvaluated) { morph.nodeEvaluated(); }
  }

  pushElement(element) {
    this.elementStack.push(element);
    this.element = this.contextualElement = element;
  }

  popElement() {
    let top = this.elementStack.pop();
    let len = this.elementStack.length;

    if (len) {
      let element = this.elementStack[len - 1];
      this.element = this.contextualElement = element;
    } else {
      this.element = this.originalElement;
      this.contextualElement = this.renderNode.contextualElement;
    }

    return top;
  }
}