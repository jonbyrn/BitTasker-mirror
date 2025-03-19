<script lang="ts">
	import { onMount } from 'svelte';

	// User data
	const currentUser = {
		id: 1,
		name: 'John Doe',
		avatar: null, // Placeholder for actual avatar URL
		isOnline: true
	};

	// Mock contacts data
	const contacts = [
		{
			id: 2,
			name: 'Sarah Johnson',
			avatar: null,
			isOnline: true,
			lastMessage: "I'll take a look at your proposal",
			lastMessageTime: '10:42 AM',
			unread: 3
		},
		{
			id: 3,
			name: 'Michael Chen',
			avatar: null,
			isOnline: false,
			lastMessage: 'The designs look great!',
			lastMessageTime: 'Yesterday',
			unread: 0
		},
		{
			id: 4,
			name: 'Emma Wilson',
			avatar: null,
			isOnline: true,
			lastMessage: 'Can we schedule a call to discuss?',
			lastMessageTime: 'Yesterday',
			unread: 1
		},
		{
			id: 5,
			name: 'Carlos Rodriguez',
			avatar: null,
			isOnline: false,
			lastMessage: 'Payment sent for the logo design',
			lastMessageTime: 'Wed',
			unread: 0
		},
		{
			id: 6,
			name: 'Priya Sharma',
			avatar: null,
			isOnline: false,
			lastMessage: 'Thanks for the quick turnaround!',
			lastMessageTime: 'Mar 15',
			unread: 0
		}
	];

	// Mock messages data for conversation with first contact
	const mockMessages = [
		{
			id: 1,
			senderId: 2,
			text: "Hi there! I saw your profile and I think you'd be perfect for my project.",
			timestamp: '10:30 AM'
		},
		{
			id: 2,
			senderId: 1,
			text: "Hello! I'd be happy to discuss your project. What are you looking for?",
			timestamp: '10:32 AM'
		},
		{
			id: 3,
			senderId: 2,
			text: 'I need a website redesign for my small business. Something modern and mobile-friendly.',
			timestamp: '10:35 AM'
		},
		{
			id: 4,
			senderId: 1,
			text: 'I can definitely help with that. Do you have any examples of designs you like?',
			timestamp: '10:38 AM'
		},
		{
			id: 5,
			senderId: 2,
			text: "Yes, I've put together a small document with some references. Here's the link to my proposal with all the details and budget.",
			timestamp: '10:40 AM'
		},
		{
			id: 6,
			senderId: 2,
			text: "I'll take a look at your proposal and get back to you with my thoughts.",
			timestamp: '10:42 AM'
		}
	];

	// State management
	let selectedContact = contacts[0];
	let messages = mockMessages;
	let newMessage = '';
	let searchTerm = '';

	// Filter contacts based on search term
	$: filteredContacts = contacts.filter((contact) =>
		contact.name.toLowerCase().includes(searchTerm.toLowerCase())
	);

	// Handle sending a new message
	function sendMessage() {
		if (newMessage.trim() === '') return;

		const message = {
			id: messages.length + 1,
			senderId: currentUser.id,
			text: newMessage,
			timestamp: 'Just now'
		};

		messages = [...messages, message];
		newMessage = '';

		// Scroll to bottom of messages
		setTimeout(() => {
			const messagesContainer = document.querySelector('.messages-container');
			if (messagesContainer) {
				messagesContainer.scrollTo({
					top: messagesContainer.scrollHeight,
					behavior: 'smooth'
				});
			}
		}, 100);
	}

	// Handle selecting a contact
	function selectContact(contact: (typeof contacts)[0]) {
		selectedContact = contact;
		// In a real app, this would fetch messages for the selected contact
	}

	// Auto-scroll to bottom of messages on mount
	onMount(() => {
		const messagesContainer = document.querySelector('.messages-container');
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});
</script>

<div class="flex h-[calc(100vh-8rem)] flex-col md:h-[calc(100vh-10rem)]">
	<h1 class="mb-4 text-3xl font-bold">Messages</h1>

	<div class="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-3">
		<!-- Contacts sidebar -->
		<div class="card bg-base-200 md:col-span-1">
			<div class="card-body p-3 md:p-4">
				<!-- Search bar -->
				<div class="form-control mb-2">
					<div class="input-group input-group-sm">
						<input
							type="text"
							placeholder="Search contacts..."
							class="input input-bordered input-sm w-full"
							bind:value={searchTerm}
						/>
						<button class="btn btn-square btn-sm">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Contacts list -->
				<div class="overflow-y-auto" style="max-height: calc(100vh - 15rem);">
					<ul class="menu menu-sm p-0">
						{#if filteredContacts.length === 0}
							<li class="text-base-content/70 p-4 text-center">No contacts found</li>
						{:else}
							{#each filteredContacts as contact}
								<li>
									<button
										class="flex items-center gap-3 {selectedContact.id === contact.id
											? 'bg-base-300'
											: ''}"
										on:click={() => selectContact(contact)}
									>
										<div class="relative">
											<!-- Avatar -->
											<div class="avatar placeholder">
												<div class="bg-neutral text-neutral-content w-10 rounded-full">
													<span>{contact.name.charAt(0)}</span>
												</div>
											</div>

											<!-- Online status indicator -->
											{#if contact.isOnline}
												<span class="bg-success absolute right-0 bottom-0 h-3 w-3 rounded-full"
												></span>
											{/if}
										</div>

										<div class="flex-1 text-left">
											<div class="flex justify-between">
												<span class="font-medium">{contact.name}</span>
												<span class="text-base-content/70 text-xs">{contact.lastMessageTime}</span>
											</div>
											<div class="flex justify-between">
												<p class="text-base-content/70 truncate text-xs" style="max-width: 150px;">
													{contact.lastMessage}
												</p>
												{#if contact.unread > 0}
													<span class="badge badge-primary badge-sm">{contact.unread}</span>
												{/if}
											</div>
										</div>
									</button>
								</li>
							{/each}
						{/if}
					</ul>
				</div>
			</div>
		</div>

		<!-- Chat area -->
		<div class="card bg-base-200 md:col-span-2">
			<div class="card-body flex flex-col p-3 md:p-4">
				<!-- Chat header -->
				<div class="border-base-300 flex items-center border-b pb-3">
					<div class="avatar placeholder mr-3">
						<div class="bg-neutral text-neutral-content w-10 rounded-full">
							<span>{selectedContact.name.charAt(0)}</span>
						</div>
					</div>
					<div>
						<h3 class="text-lg font-medium">{selectedContact.name}</h3>
						<p class="text-base-content/70 text-xs">
							{selectedContact.isOnline ? 'Online' : 'Offline'}
						</p>
					</div>
					<div class="ml-auto flex gap-2">
						<button class="btn btn-circle btn-ghost btn-sm">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
								/>
							</svg>
						</button>
						<button class="btn btn-circle btn-ghost btn-sm">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
								/>
							</svg>
						</button>
						<button class="btn btn-circle btn-ghost btn-sm">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
								/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Messages area -->
				<div class="messages-container flex-1 overflow-y-auto py-4">
					{#each messages as message}
						<div class="chat {message.senderId === currentUser.id ? 'chat-end' : 'chat-start'}">
							<div class="chat-image avatar placeholder">
								<div class="bg-neutral text-neutral-content w-8 rounded-full">
									<span>
										{message.senderId === currentUser.id
											? currentUser.name.charAt(0)
											: selectedContact.name.charAt(0)}
									</span>
								</div>
							</div>
							<div class="chat-header mb-1 text-xs opacity-70">
								{message.senderId === currentUser.id ? currentUser.name : selectedContact.name}
								<time class="text-xs opacity-70">{message.timestamp}</time>
							</div>
							<div
								class="chat-bubble {message.senderId === currentUser.id
									? 'chat-bubble-primary'
									: ''}"
							>
								{message.text}
							</div>
						</div>
					{/each}
				</div>

				<!-- Message input -->
				<div class="mt-3 flex items-end gap-2">
					<button class="btn btn-circle btn-ghost btn-sm">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
							/>
						</svg>
					</button>
					<textarea
						class="textarea textarea-bordered w-full resize-none"
						rows="1"
						placeholder="Type your message..."
						bind:value={newMessage}
						on:keydown={(e) =>
							e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
					></textarea>
					<button class="btn btn-circle bg-primary text-primary-content" on:click={sendMessage}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
							/>
						</svg>
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
