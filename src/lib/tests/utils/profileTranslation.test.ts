import { describe, it, expect } from 'vitest';
import {
	getTranslatedProfileContent,
	getTranslatedSkillName,
	getTranslatedPortfolioTitle,
	getTranslatedPortfolioDescription
} from '$lib/utils/profileTranslation';

describe('getTranslatedProfileContent', () => {
	it('returns original value when no translations provided', () => {
		const profile = { translations: undefined } as Record<string, unknown>;
		expect(getTranslatedProfileContent(profile, 'professionalTitle', 'es', 'My Title')).toBe(
			'My Title'
		);
	});

	it('returns original value when translations object is null', () => {
		expect(getTranslatedProfileContent(null, 'about', 'es', 'About text')).toBe('About text');
	});

	it('returns original value when locale matches sourceLanguage', () => {
		const profile = {
			translations: {
				sourceLanguage: 'en',
				translations: { es: { professionalTitle: 'Título', about: 'Sobre' } }
			}
		} as Record<string, unknown>;
		expect(getTranslatedProfileContent(profile, 'professionalTitle', 'en', 'My Title')).toBe(
			'My Title'
		);
	});

	it('returns translated value when translation exists for locale', () => {
		const profile = {
			translations: {
				sourceLanguage: 'en',
				translations: { es: { professionalTitle: 'Título', about: 'Sobre' } }
			}
		} as Record<string, unknown>;
		expect(getTranslatedProfileContent(profile, 'professionalTitle', 'es', 'My Title')).toBe(
			'Título'
		);
	});

	it('returns original value when no translation for requested locale', () => {
		const profile = {
			translations: {
				sourceLanguage: 'en',
				translations: { fr: { professionalTitle: 'Titre', about: 'À propos' } }
			}
		} as Record<string, unknown>;
		expect(getTranslatedProfileContent(profile, 'professionalTitle', 'es', 'My Title')).toBe(
			'My Title'
		);
	});

	it('returns original value when translated field is empty', () => {
		const profile = {
			translations: {
				sourceLanguage: 'en',
				translations: { es: { professionalTitle: '', about: 'Sobre' } }
			}
		} as Record<string, unknown>;
		expect(getTranslatedProfileContent(profile, 'professionalTitle', 'es', 'My Title')).toBe(
			'My Title'
		);
	});

	it('returns original value when locale is undefined', () => {
		const profile = {
			translations: {
				sourceLanguage: 'en',
				translations: { es: { professionalTitle: 'Título', about: 'Sobre' } }
			}
		} as Record<string, unknown>;
		expect(
			getTranslatedProfileContent(
				profile,
				'professionalTitle',
				undefined as Record<string, unknown>,
				'My Title'
			)
		).toBe('My Title');
	});
});

describe('getTranslatedSkillName', () => {
	it('returns skill string directly when skill is a string', () => {
		expect(getTranslatedSkillName('TypeScript', 'es')).toBe('TypeScript');
	});

	it('returns original name when skill has no translations', () => {
		const skill = { name: 'TypeScript' };
		expect(getTranslatedSkillName(skill, 'es')).toBe('TypeScript');
	});

	it('returns original name when locale matches sourceLanguage', () => {
		const skill = {
			name: 'TypeScript',
			translations: {
				sourceLanguage: 'en',
				translations: { es: { name: 'TypeScript (traducción)' } }
			}
		};
		expect(getTranslatedSkillName(skill, 'en')).toBe('TypeScript');
	});

	it('returns translated name when translation exists', () => {
		const skill = {
			name: 'TypeScript',
			translations: { sourceLanguage: 'en', translations: { es: { name: 'Nombre traducido' } } }
		};
		expect(getTranslatedSkillName(skill, 'es')).toBe('Nombre traducido');
	});

	it('returns original name when translation name is empty', () => {
		const skill = {
			name: 'TypeScript',
			translations: { sourceLanguage: 'en', translations: { es: { name: '' } } }
		};
		expect(getTranslatedSkillName(skill, 'es')).toBe('TypeScript');
	});

	it('returns original name when no translation for requested locale', () => {
		const skill = {
			name: 'TypeScript',
			translations: { sourceLanguage: 'en', translations: { fr: { name: 'TS français' } } }
		};
		expect(getTranslatedSkillName(skill, 'es')).toBe('TypeScript');
	});
});

describe('getTranslatedPortfolioTitle', () => {
	it('returns original title when no translations', () => {
		const item = { title: 'My Project', description: 'desc' };
		expect(getTranslatedPortfolioTitle(item, 'es')).toBe('My Project');
	});

	it('returns original title when locale matches sourceLanguage', () => {
		const item = {
			title: 'My Project',
			description: 'desc',
			translations: {
				sourceLanguage: 'en',
				translations: { es: { title: 'Proyecto', description: 'desc' } }
			}
		};
		expect(getTranslatedPortfolioTitle(item, 'en')).toBe('My Project');
	});

	it('returns translated title when translation exists', () => {
		const item = {
			title: 'My Project',
			description: 'desc',
			translations: {
				sourceLanguage: 'en',
				translations: { es: { title: 'Mi Proyecto', description: 'desc' } }
			}
		};
		expect(getTranslatedPortfolioTitle(item, 'es')).toBe('Mi Proyecto');
	});

	it('returns original title when translated title is empty', () => {
		const item = {
			title: 'My Project',
			description: 'desc',
			translations: {
				sourceLanguage: 'en',
				translations: { es: { title: '', description: 'desc' } }
			}
		};
		expect(getTranslatedPortfolioTitle(item, 'es')).toBe('My Project');
	});
});

describe('getTranslatedPortfolioDescription', () => {
	it('returns original description when no translations', () => {
		const item = { title: 't', description: 'A great project' };
		expect(getTranslatedPortfolioDescription(item, 'es')).toBe('A great project');
	});

	it('returns original description when locale matches sourceLanguage', () => {
		const item = {
			title: 't',
			description: 'A great project',
			translations: {
				sourceLanguage: 'en',
				translations: { es: { title: 't', description: 'Gran proyecto' } }
			}
		};
		expect(getTranslatedPortfolioDescription(item, 'en')).toBe('A great project');
	});

	it('returns translated description when translation exists', () => {
		const item = {
			title: 't',
			description: 'A great project',
			translations: {
				sourceLanguage: 'en',
				translations: { es: { title: 't', description: 'Un gran proyecto' } }
			}
		};
		expect(getTranslatedPortfolioDescription(item, 'es')).toBe('Un gran proyecto');
	});

	it('returns original description when translated description is empty', () => {
		const item = {
			title: 't',
			description: 'A great project',
			translations: { sourceLanguage: 'en', translations: { es: { title: 't', description: '' } } }
		};
		expect(getTranslatedPortfolioDescription(item, 'es')).toBe('A great project');
	});

	it('returns original description when no translation for requested locale', () => {
		const item = {
			title: 't',
			description: 'A great project',
			translations: {
				sourceLanguage: 'en',
				translations: { fr: { title: 't', description: 'Projet français' } }
			}
		};
		expect(getTranslatedPortfolioDescription(item, 'es')).toBe('A great project');
	});
});
