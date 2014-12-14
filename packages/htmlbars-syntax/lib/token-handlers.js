import { forEach } from "../htmlbars-util/array-utils";
import { buildProgram, buildComponent, buildElement, buildComment, buildText } from "./builders";
import {
  appendChild,
  parseComponentBlockParams,
  postprocessProgram
} from "./utils";

// The HTML elements in this list are speced by
// http://www.w3.org/TR/html-markup/syntax.html#syntax-elements,
// and will be forced to close regardless of if they have a
// self-closing /> at the end.
var voidTagNames = "area base br col command embed hr img input keygen link meta param source track wbr";
var voidMap = {};

forEach(voidTagNames.split(" "), function(tagName) {
  voidMap[tagName] = true;
});

var svgNamespace = "http://www.w3.org/2000/svg",
    // http://www.w3.org/html/wg/drafts/html/master/syntax.html#html-integration-point
    svgHTMLIntegrationPoints = {'foreignObject':true, 'desc':true, 'title':true};

function applyNamespace(tag, element, currentElement){
  if (tag.tagName === 'svg') {
    element.namespaceURI = svgNamespace;
  } else if (
    currentElement.type === 'ElementNode' &&
    currentElement.namespaceURI &&
    !currentElement.isHTMLIntegrationPoint
  ) {
    element.namespaceURI = currentElement.namespaceURI;
  }
}

function applyHTMLIntegrationPoint(tag, element){
  if (svgHTMLIntegrationPoints[tag.tagName]) {
    element.isHTMLIntegrationPoint = true;
  }
}

// Except for `mustache`, all tokens are only allowed outside of
// a start or end tag.
var tokenHandlers = {
  Comment: function(token) {
    var current = this.currentElement();
    var comment = buildComment(token.chars);
    appendChild(current, comment);
  },

  Chars: function(token) {
    var current = this.currentElement();
    var text = buildText(token.chars);
    appendChild(current, text);
  },

  StartTag: function(tag) {
    var element = buildElement(tag.tagName, tag.attributes, tag.helpers || [], []);
    element.loc = {
      start: { line: tag.firstLine, column: tag.firstColumn},
      end: { line: null, column: null}
    };

    applyNamespace(tag, element, this.currentElement());
    applyHTMLIntegrationPoint(tag, element);
    this.elementStack.push(element);
    if (voidMap.hasOwnProperty(tag.tagName) || tag.selfClosing) {
      tokenHandlers.EndTag.call(this, tag);
    }
  },

  BlockStatement: function(/*block*/) {
    if (this.tokenizer.state === 'comment') {
      return;
    } else if (this.tokenizer.state !== 'data') {
      throw new Error("A block may only be used inside an HTML element or another block.");
    }
  },

  MustacheStatement: function(mustache) {
    var state = this.tokenizer.state;
    var token = this.tokenizer.token;

    switch(state) {
      // Tag helpers
      case "tagName":
        token.addTagHelper(mustache.sexpr);
        this.tokenizer.state = "beforeAttributeName";
        return;
      case "beforeAttributeName":
        token.addTagHelper(mustache.sexpr);
        return;
      case "attributeName":
      case "afterAttributeName":
        this.tokenizer.finalizeAttributeValue();
        token.addTagHelper(mustache.sexpr);
        this.tokenizer.state = "beforeAttributeName";
        return;
      case "afterAttributeValueQuoted":
        token.addTagHelper(mustache.sexpr);
        this.tokenizer.state = "beforeAttributeName";
        return;

      // Attribute values
      case "beforeAttributeValue":
        token.markAttributeQuoted(false);
        token.addToAttributeValue(mustache);
        this.tokenizer.state = 'attributeValueUnquoted';
        return;
      case "attributeValueDoubleQuoted":
      case "attributeValueSingleQuoted":
      case "attributeValueUnquoted":
        token.addToAttributeValue(mustache);
        return;

      // TODO: Only append child when the tokenizer state makes
      // sense to do so, otherwise throw an error.
      default:
        appendChild(this.currentElement(), mustache);
    }
  },

  EndTag: function(tag) {
    var element = this.elementStack.pop();
    var parent = this.currentElement();
    var disableComponentGeneration = this.options.disableComponentGeneration === true;

    if (element.tag !== tag.tagName) {
      throw new Error(
        "Closing tag `" + tag.tagName + "` (on line " + tag.lastLine + ") " +
        "did not match last open tag `" + element.tag + "` (on line " + element.loc.start.line + ")."
      );
    }

    if (disableComponentGeneration || element.tag.indexOf("-") === -1) {
      appendChild(parent, element);
    } else {
      var program = buildProgram(element.children);
      parseComponentBlockParams(element, program);
      postprocessProgram(program);
      var component = buildComponent(element.tag, element.attributes, program);
      appendChild(parent, component);
    }

  }

};

export default tokenHandlers;