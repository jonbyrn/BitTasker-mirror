/**
 * Global Escrow Manager
 * 
 * Single entry point for all escrow operations across multiple contract versions.
 * Automatically routes operations to the correct version handler based on contract metadata.
 * 
 * Key Features:
 * - Static imports (no dynamic loading) for optimal performance
 * - Version detection from Nostr tags
 * - Capability-based API (UI asks "can I do this?" not "what version?")
 * - Forward compatible (unknown versions default to LATEST)
 * - Infinitely scalable (just add new versions to registry)
 */

import type { EscrowVersion, IEscrowHandler, IVersionHandler } from './types';
import type { ContractEvent, ContractFilter, CreateContractParams, PublishStatusParams } from '$lib/types/contract';

// Static imports - all versions loaded at startup for optimal performance
import * as v1 from './v1';
import type { FeeTier } from '@bittasker/wallet-core';
import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
import type { NostrEvent } from 'nostr-tools';
import type { Task } from '$lib/types/task';
// import * as v2 from './v2';
// import * as v3 from './v3'; // Future versions

/**
 * Version Registry
 * Add new versions here as they're implemented
 */
const VERSION_HANDLERS: Record<string, IVersionHandler> = {
    'v1': v1 as IVersionHandler,
    // 'v2': v2 as IVersionHandler,
    // 'v3': v3 as IVersionHandler, // Just add new versions here
};

/**
 * Latest Version
 * Update this when releasing a new version
 * New contracts will always use this version
 */
const LATEST_VERSION: EscrowVersion = 'v2';

/**
 * Global Escrow Manager Class
 * Provides version-agnostic API for all escrow operations
 */
class EscrowManager {
    /**
     * Get handler for specific version
     * Defaults to LATEST if version not found (forward compatibility)
     */
    private getHandler(version?: string): IVersionHandler {
        if (!version || !(version in VERSION_HANDLERS)) {
            return VERSION_HANDLERS[LATEST_VERSION];
        }
        return VERSION_HANDLERS[version];
    }

    /**
     * Extract version from contract tags
     * Defaults to LATEST if no version tag found
     */
    getVersionFromContract(contract: ContractEvent): string {
        // Check if contract has tags array
        if (!contract.tags || !Array.isArray(contract.tags)) {
            return LATEST_VERSION;
        }

        // Look for version tag ['v', 'v2']
        const versionTag = contract.tags.find((tag: string[]) => tag[0] === 'v');
        return versionTag?.[1] || LATEST_VERSION;
    }

    // ============================================
    // CAPABILITY CHECKS (Version-Agnostic)
    // ============================================

    /**
     * Generic capability check
     */
    hasFeature<K extends keyof IEscrowHandler>(
        contract: ContractEvent,
        feature: K
    ): boolean {
        const version = this.getVersionFromContract(contract);
        const handler = this.getHandler(version);
        return typeof handler.escrow[feature] === 'function';
    }

    // ============================================
    // CORE ESCROW OPERATIONS
    // ============================================

    /**
     * Create new escrow (always uses LATEST version)
     */
    async createEscrow(
        freelancerAddress: string,
        baseAmount: string,
        estimatedStartTime: number,
        estimatedCompletionTime: number,
        clientFeeTier: FeeTier,
        freelancerFeeTier: FeeTier
    ) {
        const handler = this.getHandler(LATEST_VERSION);
        return handler.escrow.createEscrow(
            freelancerAddress,
            baseAmount,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier
        );
    }

    /**
     * Load escrow details (version-aware)
     */
    async loadEscrowDetails(contractEvent: ContractEvent) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.loadEscrowDetails(contractEvent.content.escrowId, contractEvent.content.contractAddress);
    }

    /**
     * Complete task (version-aware)
     */
    async completeTask(contractEvent: ContractEvent) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.completeTask(contractEvent.content.escrowId, contractEvent.content.contractAddress);
    }

    /**
     * Accept task (version-aware)
     */
    async acceptTask(contractEvent: ContractEvent) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.acceptTask(contractEvent.content.escrowId, contractEvent.content.contractAddress);
    }

    /**
     * Cancel escrow (version-aware)
     */
    async cancelEscrow(contractEvent: ContractEvent) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.cancelEscrow(contractEvent.content.escrowId, contractEvent.content.contractAddress);
    }

    // ============================================
    // V2+ OPERATIONS (with capability checks)
    // ============================================

    /**
     * Mark work in progress (V2+)
     * Throws error if not supported by contract version
     */
    async markWorkInProgress(contractEvent: ContractEvent) {
        if (!this.hasFeature(contractEvent, 'markWorkInProgress')) {
            throw new Error('markWorkInProgress not supported for this contract version');
        }

        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.markWorkInProgress!(contractEvent.content.escrowId, contractEvent.content.contractAddress);
    }

    /**
     * Mark no show (V2+)
     */
    async markNoShow(contractEvent: ContractEvent) {
        if (!this.hasFeature(contractEvent, 'markNoShow')) {
            throw new Error('markNoShow not supported for this contract version');
        }

        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.markNoShow!(contractEvent.content.escrowId, contractEvent.content.contractAddress);
    }

    /**
     * Claim no show refund (V2+)
     */
    async claimNoShowRefund(contractEvent: ContractEvent) {
        if (!this.hasFeature(contractEvent, 'claimNoShowRefund')) {
            throw new Error('claimNoShowRefund not supported for this contract version');
        }

        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.claimNoShowRefund!(contractEvent.content.escrowId, contractEvent.content.contractAddress);
    }

    /**
     * Claim upfront deposit (V2+)
     */
    async claimUpfrontDeposit(contractEvent: ContractEvent) {
        if (!this.hasFeature(contractEvent, 'claimUpfrontDeposit')) {
            throw new Error('claimUpfrontDeposit not supported for this contract version');
        }

        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.claimUpfrontDeposit!(contractEvent.content.escrowId, contractEvent.content.contractAddress);
    }

    // ============================================
    // DISPUTE OPERATIONS
    // ============================================

    async disputeTask(contractEvent: ContractEvent, reason: string) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.disputeTask(contractEvent.content.escrowId, reason, contractEvent.content.contractAddress);
    }

    async proposeResolution(
        contractEvent: ContractEvent,
        freelancerAmount: string,
        proposedClientAmount?: string,
        proposedFreelancerAmount?: string
    ) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.proposeResolution(
            contractEvent.content.escrowId,
            freelancerAmount,
            contractEvent.id,
            proposedClientAmount,
            proposedFreelancerAmount
        );
    }

    async acceptProposal(contractEvent: ContractEvent) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.acceptProposal(contractEvent.content.escrowId, contractEvent.content.contractAddress);
    }

    async resolveAfterTimelock(contractEvent: ContractEvent, escrowStatus: number) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.escrow.resolveAfterTimelock(contractEvent.content.escrowId, escrowStatus, contractEvent.id);
    }

    // ============================================
    // BID OPERATIONS
    // ============================================

    /**
     * Accept bid and create escrow (always uses LATEST version)
     */
    async acceptBidAndCreateEscrow(
        bid: NostrEventWithFollowup,
        task: NostrEvent,
        btcPrice: number,
        network: 'RSK' | 'BSC'
    ) {
        const handler = this.getHandler(LATEST_VERSION);
        return handler.escrowBid.acceptBidAndCreateEscrow(bid, task, btcPrice, network);
    }

    /**
     * Calculate bid escrow details (always uses LATEST version)
     */
    calculateBidEscrowDetails(
        bid: NostrBidContent,
        task: Task,
        btcPrice: number
    ) {
        const handler = this.getHandler(LATEST_VERSION);
        return handler.escrowBid.calculateBidEscrowDetails(bid, task, btcPrice);
    }

    // ============================================
    // NOSTR CONTRACT OPERATIONS
    // ============================================

    /**
     * Publish contract event (always uses LATEST version)
     */
    async publishContractEvent(params: CreateContractParams) {
        const handler = this.getHandler(LATEST_VERSION);
        return handler.nostrContract.publishContractEvent(params);
    }

    /**
     * Update contract status (version-aware)
     */
    async publishContractStatus(contractEvent: ContractEvent, params: PublishStatusParams) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.nostrContract.publishContractStatus(params);
    }

    /**
     * Get contracts from Nostr (version-aware)
     */
    async getContracts(filter: ContractFilter) {
        // Use latest handler to get contracts
        const handler = this.getHandler(LATEST_VERSION);
        return handler.nostrContract.getContracts(filter);
    }

    /**
     * Delete contract from Nostr (version-aware)
     */
    async deleteContract(contractEvent: ContractEvent) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.nostrContract.deleteContract(contractEvent.id, contractEvent.content.escrowId);
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Get latest version identifier
     */
    getLatestVersion(): EscrowVersion {
        return LATEST_VERSION;
    }

    /**
     * Check if version is supported
     */
    isVersionSupported(version: string): boolean {
        return version in VERSION_HANDLERS;
    }

    /**
     * Get all supported versions
     */
    getSupportedVersions(): EscrowVersion[] {
        return Object.keys(VERSION_HANDLERS) as EscrowVersion[];
    }

    /**
     * Get version-specific enum
     */
    getEscrowStatus(contractEvent: ContractEvent) {
        const version = this.getVersionFromContract(contractEvent);
        const handler = this.getHandler(version);
        return handler.EscrowStatus;
    }
}

// Export singleton instance
export const escrow = new EscrowManager();

// Export types for external use
export type { EscrowVersion };
export { LATEST_VERSION };

// Re-export types
export type { IVersionHandler, IEscrowHandler, IEscrowBidHandler, INostrContractHandler } from './types';

