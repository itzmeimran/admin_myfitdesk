const BUTTONS = new Set(['Button', 'SubmitButton', 'AsyncButton']);

function hasVisibleIcon(node) {
  if (!node) return false;
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    const name = node.openingElement?.name;
    if (name?.type === 'JSXIdentifier' && (name.name === 'svg' || /Icon$|^Lu[A-Z]/.test(name.name))) return true;
    return node.children.some(hasVisibleIcon);
  }
  if (node.type === 'JSXExpressionContainer') return hasVisibleIcon(node.expression);
  if (node.type === 'ConditionalExpression') return hasVisibleIcon(node.consequent) && hasVisibleIcon(node.alternate);
  return false;
}

const buttonIcon = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { missing: 'Visible action buttons require an icon from the shared vocabulary. Use icon={ActionIcon} or an always-visible embedded icon. Link buttons and invisible backdrops are exempt.' },
  },
  create(context) {
    return {
      JSXElement(node) {
        const opening = node.openingElement;
        if (opening.name.type !== 'JSXIdentifier') return;
        const attribute = name => opening.attributes.find(item => item.type === 'JSXAttribute' && item.name.name === name);
        if (!BUTTONS.has(opening.name.name)) {
          if (attribute('role')?.value?.value === 'button') context.report({node: opening, message: 'Use the shared Button component instead of a custom element with role="button".'});
          return;
        }
        const variant = attribute('variant')?.value;
        if (variant?.type === 'Literal' && variant.value === 'text') return;
        if (attribute('layout')?.value?.value === 'overlay') return;
        const filename = context.filename.replaceAll('\\', '/');
        // Calendar cells show date numbers, matching the shared MyFitDesk picker.
        if (/\/components\/DatePicker\.tsx$/.test(filename) && attribute('role')?.value?.value === 'gridcell') return;
        const icon = attribute('icon');
        if (icon && !(icon.value?.type === 'JSXExpressionContainer' && icon.value.expression.type === 'Literal' && icon.value.expression.value == null)) return;
        if (node.children.some(hasVisibleIcon)) return;
        if (/\/components\/(AsyncButton|SubmitButton)\.tsx$/.test(filename) && opening.attributes.some(item => item.type === 'JSXSpreadAttribute')) return;
        context.report({ node: opening, messageId: 'missing' });
      },
    };
  },
};

export default buttonIcon;
