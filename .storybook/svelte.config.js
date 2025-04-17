import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
  // for more information about preprocessors
  preprocess: vitePreprocess(),
  compilerOptions: {
    // This is the key part - keep runes enabled for our components but provide
    // different behavior for Storybook's internal components
    runes: true
  },
  // This is the key part: we need to tell the compiler how to handle specific files
  vitePlugin: {
    inspector: true,
    emitCss: true,
    // Add a custom inclusion transform
    include: file => {
      // Return true for our components
      if (!file.includes('node_modules')) {
        return true;
      }
      
      // For Storybook's components, we need to tell them to compile without runes
      if (file.includes('node_modules/@storybook/svelte/dist/components')) {
        // Apply a specific configuration for these files
        return {
          compilerOptions: {
            runes: false
          }
        };
      }
      
      // Exclude all other node_modules files
      return false;
    }
  }
};

export default config;
