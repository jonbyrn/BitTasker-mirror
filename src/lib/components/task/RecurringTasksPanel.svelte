<script lang="ts">
  import type { TaskTemplate, ServicePackage } from '$lib/types/recurring-tasks';
  import { TASKSTATUS } from '$lib/utils/enums/recurringTask.enums';
  import recurringTasksService from '$lib/api/services/recurring-tasks.service';
  import servicePackageService from '$lib/api/services/service-package.service';
  import TaskTemplateCard from '$lib/components/task/TaskTemplateCard.svelte';
  import ServicePackageCard from '$lib/components/task/ServicePackageCard.svelte';
  import CreateTemplateForm from '$lib/components/task/CreateTemplateForm.svelte';

  let activeView = $state<'templates' | 'packages'>('templates');
  let templates = $state<TaskTemplate[]>([]);
  let packages = $state<ServicePackage[]>([]);
  let publicPackages = $state<ServicePackage[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showCreateModal = $state(false);
  let showCreatePackageModal = $state(false);

// Fetch data on mount
async function fetchData() {
  isLoading = true;
  error = null;
  
  try {
    if (activeView === 'templates') {
      templates = await recurringTasksService.getTemplates();
    } else {
      packages = await servicePackageService.getPackages();
      publicPackages = await servicePackageService.getPublicPackages();
    }
  } catch (err) {
    error = 'Failed to load data. Please try again.';
    console.error('Error fetching recurring task data:', err);
  } finally {
    isLoading = false;
  }
}

// Switch between templates and packages view
function switchView(view: 'templates' | 'packages') {
  if (activeView !== view) {
    activeView = view;
    fetchData();
  }
}

// Handle template status change
async function handleStatusChange(templateId: string, newStatus: TASKSTATUS) {
  try {
    if (newStatus === TASKSTATUS.PAUSED) {
      await recurringTasksService.pauseTemplate(templateId);
    } else if (newStatus === TASKSTATUS.ACTIVE) {
      await recurringTasksService.resumeTemplate(templateId);
    }
    
    // Update the templates list
    templates = templates.map(template => 
      template.id === templateId 
        ? { ...template, status: newStatus } 
        : template
    );
  } catch (err) {
    error = 'Failed to update template status. Please try again.';
    console.error('Error updating template status:', err);
  }
}

// Handle template deletion
async function handleDeleteTemplate(templateId: string) {
  if (confirm('Are you sure you want to delete this template? All future recurring tasks will be cancelled.')) {
    try {
      await recurringTasksService.deleteTemplate(templateId);
      templates = templates.filter(template => template.id !== templateId);
    } catch (err) {
      error = 'Failed to delete template. Please try again.';
      console.error('Error deleting template:', err);
    }
  }
}

// Handle template creation
function handleCreateNewTemplate() {
  showCreateModal = true;
}

// Handle package creation
function handleCreateNewPackage() {
  showCreatePackageModal = true;
}

// Handle template creation completion
function handleTemplateCreated(template: TaskTemplate) {
  templates = [...templates, template];
  showCreateModal = false;
}

// Handle template creation cancel
function handleCancelCreate() {
  showCreateModal = false;
}

// Handle package creation completion
function handlePackageCreated(servicePackage: ServicePackage) {
  packages = [...packages, servicePackage];
  showCreatePackageModal = false;
}

// Handle package creation cancel
function handleCancelPackageCreate() {
  showCreatePackageModal = false;
}

// Purchase a public package
async function handlePurchasePackage(packageId: string) {
  try {
    await servicePackageService.purchasePackage(packageId);
    // Reload templates since new templates will be created
    if (activeView === 'templates') {
      fetchData();
    }
  } catch (err) {
    error = 'Failed to purchase package. Please try again.';
    console.error('Error purchasing package:', err);
  }
}

// Fetch initial data
$effect(() => {
  fetchData();
});
</script>

<div class="w-full">
  <!-- Tab Controls -->
  <div class="tabs tabs-boxed mb-4">
    <button 
      class="tab {activeView === 'templates' ? 'tab-active' : ''}"
      onclick={() => switchView('templates')}
    >
      My Templates
    </button>
    <button 
      class="tab {activeView === 'packages' ? 'tab-active' : ''}"
      onclick={() => switchView('packages')}
    >
      Service Packages
    </button>
  </div>

  <!-- Error Message -->
  {#if error}
    <div class="alert alert-error mb-4">
      <span>{error}</span>
    </div>
  {/if}

  <!-- Loading State -->
  {#if isLoading}
    <div class="flex justify-center items-center h-40">
      <div class="loading loading-spinner loading-lg"></div>
    </div>
  {:else}
    <!-- Templates View -->
    {#if activeView === 'templates'}
      <div class="mb-4 flex justify-between items-center">
        <h3 class="text-lg font-semibold">Recurring Task Templates</h3>
        <button class="btn btn-primary" onclick={handleCreateNewTemplate}>
          Create New Template
        </button>
      </div>

      {#if templates.length === 0}
        <div class="card bg-base-200 p-6 text-center">
          <h3 class="text-lg mb-2">You don't have any recurring task templates yet</h3>
          <p class="mb-4">Create a template to automate your regular tasks</p>
          <button class="btn btn-primary mx-auto" onclick={handleCreateNewTemplate}>
            Create Template
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each templates as template (template.id)}
            <TaskTemplateCard 
              {template} 
              onStatusChange={(status) => handleStatusChange(template.id, status)}
              onDelete={() => handleDeleteTemplate(template.id)}
            />
          {/each}
        </div>
      {/if}

      <!-- Create Template Modal -->
      {#if showCreateModal}
        <div class="modal modal-open">
          <div class="modal-box w-11/12 max-w-3xl">
            <h3 class="font-bold text-lg mb-4">Create Recurring Task Template</h3>
            <CreateTemplateForm 
              onCancel={handleCancelCreate}
              onCreated={handleTemplateCreated}
            />
          </div>
          <div class="modal-backdrop" role="button" tabindex="0" onclick={handleCancelCreate} onkeydown={(e) => e.key === 'Enter' && handleCancelCreate()}></div>
        </div>
      {/if}
    
    <!-- Packages View -->
    {:else}
      <div class="mb-4 flex justify-between items-center">
        <h3 class="text-lg font-semibold">My Service Packages</h3>
        <button class="btn btn-primary" onclick={handleCreateNewPackage}>
          Create New Package
        </button>
      </div>

      {#if packages.length === 0}
        <div class="card bg-base-200 p-6 text-center mb-8">
          <h3 class="text-lg mb-2">You don't have any service packages yet</h3>
          <p class="mb-4">Group multiple recurring tasks into a package with bundle discounts</p>
          <button class="btn btn-primary mx-auto" onclick={handleCreateNewPackage}>
            Create Package
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {#each packages as packageItem (packageItem.id)}
            <ServicePackageCard 
              package={packageItem}
              isOwner={true}
            />
          {/each}
        </div>
      {/if}

      <!-- Public Packages Section -->
      <div class="divider my-8">Public Packages</div>
      
      <div class="mb-4">
        <h3 class="text-lg font-semibold">Available Service Packages</h3>
        <p class="text-sm opacity-70">Purchase these pre-made task packages from other providers</p>
      </div>

      {#if publicPackages.length === 0}
        <div class="card bg-base-200 p-6 text-center">
          <p>No public packages available at this time</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each publicPackages as packageItem (packageItem.id)}
            <ServicePackageCard 
              package={packageItem}
              isOwner={false}
              onPurchase={() => handlePurchasePackage(packageItem.id)}
            />
          {/each}
        </div>
      {/if}

      <!-- Create Package Modal would go here -->
      {#if showCreatePackageModal}
        <div class="modal modal-open">
          <div class="modal-box w-11/12 max-w-3xl">
            <h3 class="font-bold text-lg mb-4">Create Service Package</h3>
            <!-- Package creation form would go here -->
            <div class="modal-action">
              <button class="btn" onclick={handleCancelPackageCreate}>Cancel</button>
            </div>
          </div>
          <div class="modal-backdrop" role="button" tabindex="0" onclick={handleCancelPackageCreate} onkeydown={(e) => e.key === 'Enter' && handleCancelPackageCreate()}></div>
        </div>
      {/if}
    {/if}
  {/if}
</div>
