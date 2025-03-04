<script>
  import "../app.css";
  import { App, Navbar, Button, Link } from 'konsta/svelte';
  import { onMount } from 'svelte';
  
  let isDark = true;
  
  onMount(() => {
    // Check if there's a stored preference
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
      isDark = storedTheme === 'dark';
    } else {
      // No stored preference, default to dark
      isDark = true;
    }
    document.documentElement.classList.toggle('dark', isDark);
  });
  
  function toggleTheme() {
    isDark = !isDark;
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }
</script>

<App theme="material" class={isDark ? 'dark' : ''}>
  <Navbar title="" class="top-0 sticky">
    <div slot="left" class="flex items-center gap-4">
      <Button>Post Task</Button>
    </div>
    <div slot="right" class="flex items-center gap-4">
      <div class="p-2 cursor-pointer" on:click={toggleTheme}>
        {#if isDark}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-white">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-gray-900">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
          </svg>
        {/if}
      </div>
      <Link href="/roadmap" class="text-gray-900 dark:text-white">Roadmap</Link>
      <Link href="/proposal" class="text-gray-900 dark:text-white">Proposal</Link>
      <Button href="/login">Sign In</Button>
    </div>
  </Navbar>
  <slot />
</App>
