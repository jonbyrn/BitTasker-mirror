<script lang="ts">
  import { taskTranslationService } from '$lib/services/task-translation.service';
  import { currentUserLanguage } from '$lib/stores/translation.store';
  import type { Task } from '$lib/types/task';
  
  let { 
    task, 
    showToggle = false, // Por defecto false, solo true en mensajes
    showTitle = true,
    showDescription = true,
    titleClass = "",
    descriptionClass = "text-sm text-base-content/80 line-clamp-2"
  } = $props<{ 
    task: Task; 
    showToggle?: boolean;
    showTitle?: boolean;
    showDescription?: boolean;
    titleClass?: string;
    descriptionClass?: string;
  }>();
  
  // Solo obtener traducción almacenada - sin llamadas API
  const translatedTask = $derived.by(() => {
    const userLang = $currentUserLanguage;
    if (!userLang || !task) return null;

    // Si el idioma del usuario coincide con el idioma fuente, no hay traducción
    if (task.translations?.sourceLanguage === userLang) {
      return null;
    }

    // Obtener traducción almacenada (sin llamadas API)
    return taskTranslationService.getStoredTranslation(task, userLang);
  });

  let showOriginal = $state(false);

  function toggleTranslation() {
    showOriginal = !showOriginal;
  }
</script>

<div class="translatable-task">
  {#if translatedTask && !showOriginal}
    <!-- Mostrar contenido traducido (de las traducciones almacenadas) -->
    {#if showTitle}
      <span class={titleClass}>{translatedTask.translatedTitle}</span>
    {/if}
    {#if showDescription}
      <p class={descriptionClass}>{translatedTask.translatedDescription}</p>
    {/if}
    
    {#if showToggle}
      <button 
        class="text-xs text-blue-500 hover:text-blue-700 transition-colors" 
        onclick={toggleTranslation}
      >
        {translatedTask.targetLanguage === 'es' ? 'Ver original' : 'View original'}
      </button>
    {/if}
  {:else}
    <!-- Mostrar contenido original (cuando no hay traducción almacenada o se muestra original) -->
    {#if showTitle}
      <span class={titleClass}>{task.title}</span> 
    {/if}
    {#if showDescription}
      <p class={descriptionClass}>{task.description}</p>
    {/if}
    
    {#if translatedTask && showToggle}
      <button 
        class="text-xs text-blue-500 hover:text-blue-700 transition-colors" 
        onclick={toggleTranslation}
      >
        {translatedTask.targetLanguage === 'es' ? 'Ver traducido' : 'View translated'}
      </button>
    {/if}
  {/if}
</div>