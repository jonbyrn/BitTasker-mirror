/**
 * Interface for skill certifications
 */
export interface SkillCertification {
    name: string;
    issuer: string;
    date: string;
    fileUrl: string;
    verified: boolean;
}

/**
 * Interface for skills
 */
export interface Skill {
    name: string;
    level: number;
    verificationStatus: 'pending' | 'verified' | 'unverified';
    endorsements: number;
    certifications: SkillCertification[];
}

/**
 * Publish skills update to Nostr
 */
export async function publishSkillsUpdate(
    skills: Skill[],
    certificationFiles: { file: File; skillName: string }[] = [],
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<void> {
    try {
        // 1. Upload certification files if any
        const certificationUploads = await Promise.all(
            certificationFiles.map(async ({ file, skillName }) => {
                const uploadResult = await uploadService.uploadSingleFile(file, 'certifications');
                
                // Create certification file event
                const certEvent = {
                    kind: 1063,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        ['url', uploadResult.url],
                        ['m', file.type],
                        ['alt', 'Certification document'],
                        ['t', 'certification'],
                        ['skill', skillName]
                    ],
                    content: JSON.stringify({
                        skillName,
                        fileName: file.name
                    })
                };

                const signedCertEvent = await getSignedEvent(certEvent);
                return { event: signedCertEvent, url: uploadResult.url };
            })
        );

        // 2. Create skills event
        const skillsEvent = {
            kind: 30000,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', 'skills'], // Identifier for replaceable event
                ['t', 'skill']
            ],
            content: JSON.stringify(skills)
        };

        const signedSkillsEvent = await getSignedEvent(skillsEvent);

        // 3. Publish all events
        const allEvents = [
            signedSkillsEvent,
            ...certificationUploads.map(upload => upload.event)
        ];

        await Promise.all(
            allEvents.flatMap(event => 
                relays.map(relay => pool.publish([relay], [event]))
            )
        );
    } catch (error) {
        console.error('Failed to publish skills update:', error);
        throw error;
    }
}

/**
 * Subscribe to skills updates
 */
export async function subscribeToSkillsUpdates(
    callback: (skills: Skill[]) => void,
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<() => void> {
    try {
        // Subscribe to skills events
        const filter = {
            kinds: [30000], // Replaceable event for skills
            '#t': ['skill'],
            limit: 10
        };

        const sub = pool.subscribe(relays, filter, {
            onevent(event) {
                try {
                    if (event.kind === 30000) {
                        const skillsData = JSON.parse(event.content);
                        if (Array.isArray(skillsData)) {
                            callback(skillsData);
                        }
                    }
                } catch (err) {
                    console.error('Failed to process skills update:', err);
                }
            }
        });

        // Also fetch initial state
        const events = await pool.querySync(relays, filter);
        if (events.length > 0) {
            const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
            try {
                const skillsData = JSON.parse(latestEvent.content);
                if (Array.isArray(skillsData)) {
                    callback(skillsData);
                }
            } catch (err) {
                console.error('Failed to parse initial skills:', err);
            }
        }

        return () => {
            sub.close();
        };
    } catch (err) {
        console.error('Failed to setup skills subscription:', err);
        return () => {};
    }
} 