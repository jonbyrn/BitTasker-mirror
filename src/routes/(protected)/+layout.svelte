<script lang="ts">
    import { isAuthenticated, authLoading } from '$lib/stores/auth';
    const { children } = $props();
  </script>
  
  {#if $authLoading}
    <div class="loading-screen">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>
  {:else if $isAuthenticated}
  {@render children()}
  {:else}
    <!-- This shouldn't be seen since the +layout.ts should redirect -->
    <div class="loading-screen">
      <p>Redirecting to login...</p>
    </div>
  {/if}
  
  <style>
    .loading-screen {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100vh;
      width: 100vw;
      background-color: #f9fafb;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(0, 0, 0, 0.1);
      border-radius: 50%;
      border-top-color: #4a5568;
      animation: spin 1s ease-in-out infinite;
      margin-bottom: 1rem;
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  </style>