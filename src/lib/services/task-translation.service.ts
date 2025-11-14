import type { Task, TaskTranslation } from '$lib/types/task';

/**
 * TaskTranslationService - Solo lee traducciones almacenadas en eventos Nostr
 * NO hace traducciones bajo demanda - todas las traducciones se hacen al crear la tarea
 */
export class TaskTranslationService {
  /**
   * Obtiene la traducción almacenada de una tarea (sin llamadas API)
   * Solo devuelve traducciones que ya están guardadas en el evento Nostr
   */
  getStoredTranslation(task: Task, targetLanguage: string): TaskTranslation | null {
    if (!task?.id || !task?.title || !task?.description) {
      return null;
    }

    // Solo usar traducciones almacenadas en el evento Nostr
    if (task.translations?.translations && task.translations.translations[targetLanguage]) {
      const storedTranslation = task.translations.translations[targetLanguage];
      const sourceLanguage = task.translations.sourceLanguage;
      
      // Retornar traducción del evento Nostr - sin llamadas API
      return {
        taskId: task.id,
        originalTitle: task.title,
        translatedTitle: storedTranslation.title,
        originalDescription: task.description,
        translatedDescription: storedTranslation.description,
        targetLanguage,
        sourceLanguage,
        timestamp: Date.now()
      };
    }

    // Si no hay traducción almacenada, retornar null
    // (las tareas antiguas sin traducciones mostrarán el original)
    return null;
  }
}

export const taskTranslationService = new TaskTranslationService();
