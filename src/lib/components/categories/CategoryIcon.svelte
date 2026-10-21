<script lang="ts">
	import IconBroom from '~icons/mdi/broom';
	import IconTruck from '~icons/mdi/truck';
	import IconHammer from '~icons/mdi/hammer-wrench';
	import IconScrewdriver from '~icons/mdi/screwdriver';
	import IconTelevision from '~icons/mdi/television';
	import IconDolly from '~icons/mdi/human-dolly';
	import IconFlower from '~icons/mdi/flower';
	import IconPipe from '~icons/mdi/pipe-wrench';
	import IconFlash from '~icons/mdi/flash';
	import IconPaint from '~icons/mdi/format-paint';
	import IconPaw from '~icons/mdi/paw';
	import IconFace from '~icons/mdi/face-woman-shimmer';
	import IconCar from '~icons/mdi/car';
	import IconCamera from '~icons/mdi/camera';
	import IconClipboard from '~icons/mdi/clipboard-text-outline';
	import IconLaptop from '~icons/mdi/laptop';
	import IconCode from '~icons/mdi/code-tags';
	import IconPalette from '~icons/mdi/palette';
	import IconBullhorn from '~icons/mdi/bullhorn-outline';
	import IconPencil from '~icons/mdi/pencil';
	import IconSchool from '~icons/mdi/school';
	import IconBitcoin from '~icons/mdi/bitcoin';
	import IconRobot from '~icons/mdi/robot-outline';
	import IconHardHat from '~icons/mdi/account-hard-hat';
	import IconScale from '~icons/mdi/scale-balance';

	let { name = 'broom' }: { name?: string } = $props();

	const icons = {
		broom: IconBroom,
		truck: IconTruck,
		hammer: IconHammer,
		screwdriver: IconScrewdriver,
		television: IconTelevision,
		dolly: IconDolly,
		flower: IconFlower,
		pipe: IconPipe,
		flash: IconFlash,
		paint: IconPaint,
		paw: IconPaw,
		face: IconFace,
		car: IconCar,
		camera: IconCamera,
		clipboard: IconClipboard,
		laptop: IconLaptop,
		code: IconCode,
		palette: IconPalette,
		bullhorn: IconBullhorn,
		pencil: IconPencil,
		school: IconSchool,
		bitcoin: IconBitcoin,
		robot: IconRobot,
		hardhat: IconHardHat,
		scale: IconScale
	};

	const Icon = $derived(icons[name as keyof typeof icons] ?? IconBroom);
</script>

<span class="text-primary inline-flex text-3xl" aria-hidden="true">
	<Icon />
</span>
