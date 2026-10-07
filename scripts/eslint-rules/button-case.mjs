const BUTTONS = new Set(['Button', 'ButtonLink', 'SubmitButton', 'AsyncButton']);
const NAMES = new Set(['WhatsApp', 'MyFitDesk', 'Meta', 'Supabase', 'Razorpay', 'API', 'CRM', 'CSV', 'OTP', 'PIN', 'ID', 'IST', 'SMS', 'URL', 'HTTP', 'SQL', 'DEV', 'PROD', 'AM', 'PM']);

function sentenceCase(text) {
  const words = text.trim().match(/[A-Za-z]+/g) ?? [];
  // JSX text can be a continuation after a dynamic count ("{count} gyms").
  return words.every((word, index) => NAMES.has(word) || (index === 0 ? /^(?:[A-Z][a-z]*|[a-z]+)$/.test(word) : /^[a-z]+$/.test(word)));
}

/** Catch page-level overrides before they undo the shared sentence-case rule. */
const buttonCase = {
  meta: { type: 'problem', schema: [], messages: {
    casing: 'Button labels use sentence case. Remove uppercase/capitalize styling and write the action label in sentence case.',
  } },
  create(context) {
    function inButton(node) {
      for (let parent = node.parent; parent; parent = parent.parent) {
        const opening = parent.type === 'JSXElement' ? parent.openingElement : parent.type === 'JSXSelfClosingElement' ? parent : undefined;
        if (opening?.name.type === 'JSXIdentifier' && BUTTONS.has(opening.name.name)) return true;
      }
      return false;
    }
    function checkLabel(node, text) {
      if (text.trim() && !sentenceCase(text)) context.report({ node, messageId: 'casing' });
    }
    return {
      JSXText(node) {
        if (inButton(node)) checkLabel(node, node.value);
      },
      JSXExpressionContainer(node) {
        // Display branches only; never transform comparison values or user data.
        if (node.parent.type !== 'JSXElement' || !inButton(node)) return;
        function check(expression) {
          if (expression.type === 'Literal' && typeof expression.value === 'string') checkLabel(expression, expression.value);
          else if (expression.type === 'ConditionalExpression') { check(expression.consequent); check(expression.alternate); }
        }
        check(node.expression);
      },
      JSXAttribute(node) {
        if (!node.value) return;
        if (node.name.name === 'pendingLabel' && inButton(node) && node.value.type === 'Literal') checkLabel(node.value, node.value.value);
        if (!['className', 'style'].includes(node.name.name)) return;
        let parent = node.parent;
        while (parent) {
          if (parent.type === 'JSXElement' || parent.type === 'JSXSelfClosingElement') {
            const opening = parent.openingElement ?? parent;
            if (opening.name.type === 'JSXIdentifier' && BUTTONS.has(opening.name.name)) {
              const text = context.sourceCode.getText(node.value);
              if (node.name.name === 'className' ? /\b(?:uppercase|capitalize)\b/.test(text) : /textTransform\s*:\s*['"](?:uppercase|capitalize)['"]/.test(text)) {
                context.report({ node, messageId: 'casing' });
              }
              return;
            }
          }
          parent = parent.parent;
        }
      },
    };
  },
};

export default buttonCase;
