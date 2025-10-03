import type { Task, TaskTranslation } from '$lib/types/task';
import type { TranslationResult, TranslationError } from './translation.service';
import { TranslationService } from './translation.service';

export class TaskTranslationService {
  private cache = new Map<string, TaskTranslation>();
  private translationService = new TranslationService();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  async translateTask(task: Task, targetLanguage: string): Promise<TaskTranslation | null> {
    if (!task?.id || !task?.title || !task?.description) {
      return null;
    }

    const cacheKey = `${task.id}-${targetLanguage}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    try {
      // Translate both title and description in parallel
      const [titleResult, descResult] = await Promise.all([
        this.translationService.translate(task.title, targetLanguage),
        this.translationService.translate(task.description, targetLanguage)
      ]);

      // Check if translation failed
      if ('code' in titleResult || 'code' in descResult) {
        console.warn('Translation failed for task:', task.id);
        return null;
      }

      const translation: TaskTranslation = {
        taskId: task.id,
        originalTitle: task.title,
        translatedTitle: titleResult.translatedText,
        originalDescription: task.description,
        translatedDescription: descResult.translatedText,
        targetLanguage,
        sourceLanguage: titleResult.detectedSourceLanguage || 'unknown',
        timestamp: Date.now()
      };

      // Cache the result
      this.cache.set(cacheKey, translation);
      return translation;
    } catch (error) {
      console.error('Translation service error:', error);
      return null;
    }
  }

  private isCacheValid(translation: TaskTranslation): boolean {
    return Date.now() - translation.timestamp < this.CACHE_DURATION;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  // Method for translating individual text content (like bid descriptions)
  async translateText(text: string, targetLanguage: string): Promise<TranslationResult | TranslationError | null> {
    try {
      return await this.translationService.translate(text, targetLanguage);
    } catch (error) {
      console.error('Text translation error:', error);
      return null;
    }
  }
}

export const taskTranslationService = new TaskTranslationService();
