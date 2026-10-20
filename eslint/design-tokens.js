/**
 * Flags raw colors in Svelte files. Design-system components must use DaisyUI tokens.
 * @type {import('eslint').ESLint.Plugin}
 */
const rawColor = /#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\(/g;

const noRawColor = {
	meta: {
		type: 'suggestion',
		docs: {
			description: 'Use DaisyUI color tokens instead of raw colors'
		},
		schema: [],
		messages: {
			raw: 'Use a DaisyUI token (bg-primary, text-base-content, border-base-300) instead of a raw color.'
		}
	},
	create(context) {
		return {
			Program(node) {
				const text = context.sourceCode.getText();
				rawColor.lastIndex = 0;
				let match = rawColor.exec(text);
				while (match) {
					const loc = context.sourceCode.getLocFromIndex(match.index);
					context.report({ node, loc, messageId: 'raw' });
					match = rawColor.exec(text);
				}
			}
		};
	}
};

export default {
	rules: {
		'no-raw-color': noRawColor
	}
};
