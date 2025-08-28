<script lang="ts">
  import { UpdateUserProfileStore } from '$houdini';
  import type { User } from '$houdini';

  let { user } = $props<{
    user: User | null | undefined;
  }>();

  const profileStore = new UpdateUserProfileStore();

  // Local state
  let isGenerating = $state(false);
  let error = $state('');
  let suggestions = $state<{
    section: string;
    current: string;
    suggestion: string;
    reason: string;
  }[]>([]);

  // Generate profile suggestions
  async function generateSuggestions() {
    try {
      isGenerating = true;
      error = '';

      // TODO: Integrate with AI service to generate suggestions
      // For now, using mock suggestions
      suggestions = [
        {
          section: 'Professional Title',
          current: user?.professionalTitle || '',
          suggestion: 'Senior Full Stack Developer & DevOps Specialist',
          reason: 'More specific and highlights key expertise areas'
        },
        {
          section: 'Profile Description',
          current: user?.profileDescription || '',
          suggestion: 'Passionate full-stack developer with 8+ years of experience building scalable web applications. Specialized in React, Node.js, and AWS cloud architecture. Strong focus on code quality and performance optimization.',
          reason: 'Highlights experience, technical skills, and value proposition'
        },
        {
          section: 'Skills',
          current: 'React, JavaScript, Node.js',
          suggestion: 'React.js, TypeScript, Node.js, AWS, Docker, CI/CD, MongoDB',
          reason: 'More comprehensive and includes in-demand technologies'
        }
      ];

      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
    } catch (err) {
      console.error('Failed to generate suggestions:', err);
      error = err instanceof Error ? err.message : 'Failed to generate suggestions';
    } finally {
      isGenerating = false;
    }
  }

  // Apply suggestion
  async function applySuggestion(section: string, suggestion: string) {
    try {
      isGenerating = true;
      error = '';

      // Update profile using GraphQL
      const result = await profileStore.mutate({
        input: {
          [section.toLowerCase().replace(/\s+/g, '')]: suggestion
        }
      });

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Show success message
      const toast = document.getElementById('ai-toast-success');
      if (toast) toast.style.display = 'block';
    } catch (err) {
      console.error('Failed to apply suggestion:', err);
      error = err instanceof Error ? err.message : 'Failed to apply suggestion';
    } finally {
      isGenerating = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-medium">AI Profile Assistant</h3>
      <p class="text-base-content/70">
        Get AI-powered suggestions to improve your profile
      </p>
    </div>
    <button
      class="btn btn-primary"
      onclick={generateSuggestions}
      disabled={isGenerating}
    >
      {#if isGenerating}
        <span class="loading loading-spinner"></span>
      {:else}
        Generate Suggestions
      {/if}
    </button>
  </div>

  {#if suggestions.length > 0}
    <div class="space-y-4">
      {#each suggestions as { section, current, suggestion, reason }}
        <div class="card bg-base-200">
          <div class="card-body">
            <h4 class="card-title text-base">{section}</h4>
            
            <div class="grid gap-4 md:grid-cols-2">
              <!-- Current Content -->
              <div>
                <h5 class="mb-2 font-medium text-base-content/70">Current</h5>
                <p class="rounded-lg bg-base-100 p-3">
                  {current || 'Not set'}
                </p>
              </div>

              <!-- Suggested Content -->
              <div>
                <h5 class="mb-2 font-medium text-primary">Suggested</h5>
                <p class="rounded-lg bg-primary/10 p-3">
                  {suggestion}
                </p>
              </div>
            </div>

            <div class="mt-4">
              <p class="text-sm text-base-content/70">
                <span class="font-medium">Why?</span> {reason}
              </p>
            </div>

            <div class="card-actions mt-4 justify-end">
              <button
                class="btn btn-primary btn-sm"
                onclick={() => applySuggestion(section, suggestion)}
                disabled={isGenerating}
              >
                {#if isGenerating}
                  <span class="loading loading-spinner"></span>
                {:else}
                  Apply Suggestion
                {/if}
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else if !isGenerating}
    <div class="alert">
      <span>Click "Generate Suggestions" to get AI-powered recommendations for your profile.</span>
    </div>
  {/if}

  <!-- Error Message -->
  {#if error}
    <div class="alert alert-outline alert-error">
      <span>{error}</span>
    </div>
  {/if}
</div>

<!-- Success Toast -->
<div id="ai-toast-success" class="toast toast-end" style="display: none;">
  <div class="alert alert-outline alert-success">
    <span>Suggestion applied successfully!</span>
  </div>
</div> 