<script lang="ts">
  import { taskTranslationService } from '$lib/services/task-translation.service';
  import { currentUserLanguage } from '$lib/stores/translation.store';
  import type { Task } from '$lib/types/task';
  import { t } from 'svelte-i18n';
  
  let { 
    task, 
    showToggle = false, // Por defecto false, solo true en mensajes
    showTitle = true,
    showDescription = true,
    showDescriptionToggle = true, // Controla si se muestra el botón de mostrar más/menos
    titleClass = "",
    descriptionClass = "text-sm text-base-content/80 whitespace-pre-line line-clamp-2"
  } = $props<{ 
    task: Task; 
    showToggle?: boolean;
    showTitle?: boolean;
    showDescription?: boolean;
    showDescriptionToggle?: boolean;
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
  let descriptionElement: HTMLParagraphElement | null = $state(null);
  let isDescriptionTruncated = $state(false);
  let showFullDescription = $state(false);

  function toggleTranslation() {
    showOriginal = !showOriginal;
  }

  // Check if description is actually truncated
  function checkIfTruncated() {
    if (!descriptionElement) return;
    
    // Create a hidden clone to measure full height without affecting layout
    const clone = descriptionElement.cloneNode(true) as HTMLElement;
    clone.className = descriptionElement.className.replace(/line-clamp-\d+/g, '');
    clone.style.position = 'absolute';
    clone.style.visibility = 'hidden';
    clone.style.height = 'auto';
    clone.style.width = descriptionElement.offsetWidth + 'px';
    document.body.appendChild(clone);
    
    const fullHeight = clone.scrollHeight;
    const lineHeight = parseFloat(getComputedStyle(descriptionElement).lineHeight) || 20;
    const maxHeight = lineHeight * 2; // 2 lines
    
    // Clean up
    document.body.removeChild(clone);
    
    // Only show ellipsis if content is actually taller than 2 lines
    isDescriptionTruncated = fullHeight > maxHeight + 1; // +1 for small margin
  }

  $effect(() => {
    // React to description changes
    const currentDescription = translatedTask && !showOriginal 
      ? translatedTask.translatedDescription 
      : task.description;
    
    if (descriptionElement && descriptionClass.includes('line-clamp-2') && currentDescription) {
      // Reset state when description changes
      showFullDescription = false;
      isDescriptionTruncated = false;
      
      // Use requestAnimationFrame to ensure DOM is rendered
      requestAnimationFrame(() => {
        setTimeout(() => {
          checkIfTruncated();
        }, 0);
      });
    }
  });

  function toggleDescription() {
    showFullDescription = !showFullDescription;
  }
</script>

<div class="translatable-task">
  {#if translatedTask && !showOriginal}
    <!-- Mostrar contenido traducido (de las traducciones almacenadas) -->
    {#if showTitle}
      <span class={titleClass}>{translatedTask.translatedTitle}</span>
    {/if}
    {#if showDescription}
      <p 
        bind:this={descriptionElement}
        class={showFullDescription ? descriptionClass.replace(/line-clamp-\d+/g, '') : descriptionClass}
      >
        {translatedTask.translatedDescription}
      </p>
      {#if isDescriptionTruncated && descriptionClass.includes('line-clamp-2') && showDescriptionToggle}
        <button 
          class="btn btn-xs btn-ghost mt-1" 
          onclick={toggleDescription}
        >
          {showFullDescription ? $t('common.show_less') : $t('common.show_more')}
        </button>
      {/if}
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
      <p 
        bind:this={descriptionElement}
        class={showFullDescription ? descriptionClass.replace(/line-clamp-\d+/g, '') : descriptionClass}
      >
        {task.description}
      </p>
      {#if isDescriptionTruncated && descriptionClass.includes('line-clamp-2') && showDescriptionToggle}
        <button 
          class="btn btn-xs btn-ghost mt-1" 
          onclick={toggleDescription}
        >
          {showFullDescription ? $t('common.show_less') : $t('common.show_more')}
        </button>
      {/if}
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
