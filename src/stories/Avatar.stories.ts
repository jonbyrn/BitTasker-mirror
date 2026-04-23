import type { Meta, StoryObj } from '@storybook/svelte';
import Avatar from '$lib/components/Avatar.svelte';

const meta = {
	title: 'Components/Avatar',
	component: Avatar,
	tags: ['autodocs'],
	argTypes: {
		size: {
			control: { type: 'select' },
			options: ['xs', 'sm', 'md', 'lg', 'xl'],
			description: 'Size of the avatar',
			defaultValue: 'md'
		},
		user: {
			control: 'object',
			description: 'User object containing name and optional profile image'
		}
	}
} satisfies Meta<Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic stories with different sizes
export const Default: Story = {
	args: {
		user: {
			name: 'John Doe',
			profileImage: null
		},
		size: 'md'
	}
};

export const Small: Story = {
	args: {
		user: {
			name: 'John Doe',
			profileImage: null
		},
		size: 'sm'
	}
};

export const Large: Story = {
	args: {
		user: {
			name: 'John Doe',
			profileImage: null
		},
		size: 'lg'
	}
};

// With profile image
export const WithImage: Story = {
	args: {
		user: {
			name: 'John Doe',
			profileImage: 'https://i.pravatar.cc/300'
		},
		size: 'md'
	}
};

// Different names to show different colors and initials
export const DifferentUsers: Story = {
	args: {
		user: {
			name: 'John Doe',
			profileImage: null
		},
		size: 'md'
	}
};

// Show all sizes
export const AllSizes: Story = {
	args: {
		user: {
			name: 'John Doe',
			profileImage: null
		},
		size: 'lg'
	}
}; 