import type { StorybookConfig } from '@storybook/sveltekit';
import type { Plugin } from 'vite';

const config: StorybookConfig = {
	stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|ts|svelte)'],
	addons: [
		'@storybook/addon-svelte-csf',
		'@chromatic-com/storybook',
	],
	framework: {
		name: '@storybook/sveltekit',
		options: {}
	},
	async viteFinal(config) {
		// Add our transform plugin to convert export let to $props() for Storybook components
		config.plugins = config.plugins || [];
		config.plugins.push({
			name: 'svelte5-storybook-compat',
			transform(code, id) {
				// Only transform Storybook's Svelte components
				if (id.includes('node_modules/@storybook/svelte/dist/components') && id.endsWith('.svelte')) {
					// Convert export let declarations to $props
					const modified = code.replace(
						/<script([^>]*)>(([\s\S](?!<\/script>))*)export\s+let\s+([a-zA-Z0-9_$]+)(\s*=\s*([^;]+))?;/g,
						(match, scriptAttrs, beforeExport, _, propName, defaultValuePart, defaultValue) => {
							// Add $state import if not already present
							const hasStateImport = beforeExport.includes('import { $props }');
							const importStatement = hasStateImport ? '' : 'import { $props } from "svelte";\n';
							
							// Convert the export let to $props declaration
							let propsDeclaration;
							if (defaultValuePart) {
								propsDeclaration = `const { ${propName} = ${defaultValue} } = $props();`;
							} else {
								propsDeclaration = `const { ${propName} } = $props();`;
							}
							
							return `<script${scriptAttrs}>${importStatement}${beforeExport}${propsDeclaration}`;
						}
					);
					
					return {
						code: modified,
						map: null
					};
				}
				return null;
			}
		} as Plugin);
		
		return config;
	}
};
export default config;
