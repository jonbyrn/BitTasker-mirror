type ClickOutsideAction = (node: HTMLElement, options?: { callback: () => void }) => {
    destroy: () => void;
};

export const clickOutside: ClickOutsideAction = (node, options) => {
    const handleClick = (event: MouseEvent) => {
        if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
            options?.callback?.();
        }
    };

    document.addEventListener('click', handleClick, true);

    return {
        destroy() {
            document.removeEventListener('click', handleClick, true);
        }
    };
};
