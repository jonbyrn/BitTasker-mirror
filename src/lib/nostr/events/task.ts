import type { TaskBody } from '$lib/types/task';
// import { createDebug } from '$lib/utils/debug';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import NDK, { NDKEvent, type NostrEvent } from '@nostr-dev-kit/ndk';

//const d = createDebug('ndk:events:task');

/**
 * task class - represents kind 31000
 */
export class NDKTask extends NDKEvent {
	static kind = 31000;
	static kinds = [31000];

	constructor(ndk?: NDK, event?: NostrEvent | NDKEvent) {
		super(ndk, event);
		this.kind ??= 31000;

		// Workaround to register published relay to ndk cache adapter
		this.on('relay:published', (relay) => {
			this.emit('published', relay);
		});
	}

	static async from(event: NDKEvent): Promise<NDKTask | undefined> {
		const task = new NDKTask(event.ndk, event.rawEvent());

		//d.log('Creating task from event with wrap:', task);

		return task;
	}

	get taskContent(): TaskBody {
		return JSON.parse(this.content) as unknown as TaskBody;
	}

	set status(status: TaskStatusEnum) {
		// update tag
		this.removeTag('S');
		this.tags.push(['S', status]);
		//update content
		const body = this.taskContent;
		body.status = status;
		this.content = JSON.stringify(body);
	}

	get status(): TaskStatusEnum {
		return this.tagValue('S') as TaskStatusEnum;
	}

	set acceptedBid(bidId: string) {
		this.removeTag('acceptedBid');
		this.tags.push(['acceptedBid', bidId]);
	}

	get acceptedBid(): string | undefined {
		return this.tagValue('acceptedBid');
	}
}
