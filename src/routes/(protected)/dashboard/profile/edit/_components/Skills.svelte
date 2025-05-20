<script lang="ts">
	import { onMount } from 'svelte';
  import { getNostrMetadata } from '$lib/nostr/profile';
  import { publishEvent } from '$lib/utils/nostr';
  import Uploader from '$lib/components/Uploader.svelte';
  import uploadService from '$lib/api/services/upload.service';

  interface Skill {
    name: string;
    level: number;
    verificationStatus: 'pending' | 'verified' | 'unverified';
    endorsements: number;
    certifications: Array<{
      name: string;
      issuer: string;
      date: string;
      fileUrl: string;
      verified: boolean;
    }>;
  }

  let { user, onComplete } = $props<{
    user: { skills?: Array<Skill> | null } | null | undefined;
    onComplete: (completed: boolean) => void;
  }>();

  // Local state
  let skills = $state<Skill[]>(user?.skills || []);
  let newSkillName = $state('');
  let newSkillLevel = $state(3);
  let isLoading = $state(false);
  let error = $state('');
  let selectedSkill = $state<Skill | null>(null);
  let certificationName = $state('');
  let certificationIssuer = $state('');
  let certificationDate = $state('');
  let certificationFile: File | null = $state(null);

  // Load Nostr skills data
  onMount(async () => {
    if (!user?.pubkey) return;
    try {
      const nostrProfile = await getNostrMetadata();
      if (nostrProfile) {
        const metadata = JSON.parse(nostrProfile.content);
        if (metadata.skills) {
          skills = metadata.skills.map((skill: any) => ({
            name: skill.name,
            level: skill.level,
            verificationStatus: skill.verified ? 'verified' : 'unverified',
            endorsements: skill.endorsements || 0,
            certifications: skill.certifications || []
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load Nostr skills:', err);
    }
  });

  // Track form completion
  $effect(() => {
    const isComplete = skills.length > 0;
    onComplete(isComplete);
  });

  // Add new skill with Nostr
  async function addSkill() {
    if (!newSkillName.trim()) return;

    try {
      isLoading = true;
      error = '';

      const newSkill: Skill = {
        name: newSkillName.trim(),
        level: newSkillLevel,
        verificationStatus: 'unverified',
        endorsements: 0,
        certifications: []
      };

      // Create Nostr event for skill
      const skillEvent = {
        kind: 30000, // Using parameterized replaceable event
        content: JSON.stringify(newSkill),
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', `skill-${newSkill.name.toLowerCase()}`],
          ['t', 'skill']
        ]
      };

      await publishEvent(skillEvent);
      skills = [...skills, newSkill];
      newSkillName = '';
      newSkillLevel = 3;
    } catch (err) {
      console.error('Failed to add skill:', err);
      error = err instanceof Error ? err.message : 'Failed to add skill';
    } finally {
      isLoading = false;
    }
  }

  // Remove skill with Nostr
  async function removeSkill(index: number) {
    try {
      isLoading = true;
      error = '';

      const skillToRemove = skills[index];
      
      // Create deletion event
      const deleteEvent = {
        kind: 5,
        content: '',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', `skill-${skillToRemove.name.toLowerCase()}`],
          ['t', 'skill']
        ]
      };

      await publishEvent(deleteEvent);
      skills = skills.filter((_, i) => i !== index);
    } catch (err) {
      console.error('Failed to remove skill:', err);
      error = err instanceof Error ? err.message : 'Failed to remove skill';
    } finally {
      isLoading = false;
    }
  }

  // Update skill level with Nostr
  async function updateSkillLevel(index: number, level: number) {
    try {
      isLoading = true;
      error = '';

      const updatedSkill = { ...skills[index], level };

      // Create update event
      const updateEvent = {
        kind: 30000,
        content: JSON.stringify(updatedSkill),
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', `skill-${updatedSkill.name.toLowerCase()}`],
          ['t', 'skill']
        ]
      };

      await publishEvent(updateEvent);
      skills = skills.map((skill, i) => (i === index ? updatedSkill : skill));
    } catch (err) {
      console.error('Failed to update skill level:', err);
      error = err instanceof Error ? err.message : 'Failed to update skill level';
    } finally {
      isLoading = false;
    }
  }

  // Handle certification file upload with Nostr
  async function handleCertificationUpload(files: File[]) {
    if (!files.length || !selectedSkill) return;

    try {
      isLoading = true;
      error = '';

      // 1. Upload file to media server
      const file = files[0];
      const uploadedFile = await uploadService.uploadSingleFile(file, 'certifications');

      // 2. Create Nostr event for certification file
      const certFileEvent = {
        kind: 1063,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['url', uploadedFile.url],
          ['m', file.type],
          ['alt', 'Certification document']
        ],
        content: 'Certification document'
      };

      await publishEvent(certFileEvent);
      certificationFile = file;
    } catch (err) {
      console.error('File upload failed:', err);
      error = 'Failed to upload certification. Please try again.';
    } finally {
      isLoading = false;
    }
  }

  // Add certification to skill with Nostr
  async function addCertification() {
    if (!selectedSkill || !certificationName || !certificationIssuer || !certificationDate || !certificationFile) {
      error = 'Please fill in all certification fields';
      return;
    }

    try {
      isLoading = true;
      error = '';

      // Create certification object
      const certification = {
        name: certificationName,
        issuer: certificationIssuer,
        date: certificationDate,
        fileUrl: uploadedFile.url,
        verified: false
      };

      // Update skill with new certification
      const updatedSkill = {
        ...selectedSkill,
        certifications: [...selectedSkill.certifications, certification]
      };

      // Create Nostr event for updated skill
      const skillEvent = {
        kind: 30000,
        content: JSON.stringify(updatedSkill),
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', `skill-${updatedSkill.name.toLowerCase()}`],
          ['t', 'skill'],
          ['cert', certificationFile.url]
        ]
      };

      await publishEvent(skillEvent);

      // Update local state
      skills = skills.map(skill => 
        skill === selectedSkill 
          ? updatedSkill
          : skill
      );

      // Reset form
      certificationName = '';
      certificationIssuer = '';
      certificationDate = '';
      certificationFile = null;
      selectedSkill = null;

      // Close modal
      const modal = document.getElementById('certification-modal') as HTMLDialogElement;
      if (modal) modal.close();
    } catch (err) {
      console.error('Failed to add certification:', err);
      error = err instanceof Error ? err.message : 'Failed to add certification';
    } finally {
      isLoading = false;
    }
  }

  // Save skills
  async function handleSubmit() {
    try {
      isLoading = true;
      error = '';

      // Update profile using GraphQL
      const result = await profileStore.mutate({
        input: {
          skills: skills.map(skill => ({
            name: skill.name,
            level: skill.level,
            verificationStatus: skill.verificationStatus,
            endorsements: skill.endorsements,
            certifications: skill.certifications
          }))
        }
      });

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Show success message
      const toast = document.getElementById('skills-toast-success');
      if (toast) toast.style.display = 'block';
    } catch (err) {
      console.error('Skills update failed:', err);
      error = err instanceof Error ? err.message : 'Failed to update skills';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Add New Skill -->
  <div class="grid gap-4">
    <div class="form-control">
      <label class="label" for="newSkillName">
        <span class="label-text font-medium">Skill Name</span>
      </label>
      <input
        type="text"
        id="newSkillName"
        bind:value={newSkillName}
        class="input input-bordered w-full"
        placeholder="Add a skill"
      />
    </div>

    <div class="form-control">
      <label class="label" for="newSkillLevel">
        <span class="label-text font-medium">Proficiency Level</span>
        <span class="label-text-alt">1 = Beginner, 5 = Expert</span>
      </label>
      <input
        type="range"
        id="newSkillLevel"
        bind:value={newSkillLevel}
        min="1"
        max="5"
        class="range range-primary range-xs w-full"
      />
      <div class="flex w-full justify-between px-2 text-xs">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
      </div>
    </div>

    <div class="form-control flex items-end">
      <button 
        class="btn btn-primary w-full" 
        onclick={addSkill}
        disabled={!newSkillName.trim()}
      >
        Add Skill
      </button>
    </div>
  </div>

  <!-- Skills List -->
  {#if skills.length > 0}
    <div class="space-y-4">
      <h3 class="text-lg font-medium">Your Skills</h3>
      
      <div class="overflow-x-auto">
        <table class="table w-full">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Level</th>
              <th>Status</th>
              <th>Endorsements</th>
              <th>Certifications</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each skills as skill, i}
              <tr>
                <td>{skill.name}</td>
                <td>
                  <div class="rating rating-sm">
                    {#each Array(5) as _, j}
                      <input
                        type="radio"
                        name={`rating-${i}`}
                        class="mask mask-star-2 bg-orange-400"
                        checked={j + 1 === skill.level}
                        onchange={() => updateSkillLevel(i, j + 1)}
                      />
                    {/each}
                  </div>
                </td>
                <td>
                  <span class="badge {
                    skill.verificationStatus === 'verified' ? 'badge-success' :
                    skill.verificationStatus === 'pending' ? 'badge-warning' :
                    'badge-ghost'
                  }">
                    {skill.verificationStatus}
                  </span>
                </td>
                <td>
                  <span class="badge badge-ghost">{skill.endorsements}</span>
                </td>
                <td>
                  <div class="flex items-center gap-2">
                    <span class="badge badge-ghost">{skill.certifications.length}</span>
                    <button 
                      class="btn btn-ghost btn-xs"
                      onclick={() => {
                        selectedSkill = skill;
                        const modal = document.getElementById('certification-modal') as HTMLDialogElement;
                        if (modal) modal.showModal();
                      }}
                    >
                      Add
                    </button>
                  </div>
                </td>
                <td>
                  <button 
                    class="btn btn-error btn-xs"
                    onclick={() => removeSkill(i)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else}
    <div class="alert">
      <span>No skills added yet. Add some skills to showcase your expertise.</span>
    </div>
  {/if}

  <!-- Error Message -->
  {#if error}
    <div class="alert alert-error">
      <span>{error}</span>
    </div>
  {/if}

  <!-- Submit Button -->
  <div class="flex justify-end">
    <button 
      class="btn btn-primary" 
      onclick={handleSubmit}
      disabled={isLoading || skills.length === 0}
    >
      {#if isLoading}
        <span class="loading loading-spinner"></span>
      {/if}
      Save Skills
    </button>
  </div>
</div>

<!-- Certification Modal -->
<dialog id="certification-modal" class="modal">
  <div class="modal-box">
    <h3 class="text-lg font-bold">Add Certification</h3>
    <p class="py-4">Add a certification for {selectedSkill?.name}</p>
    
    <form method="dialog" class="space-y-4">
      <!-- Certification Name -->
      <div class="form-control">
        <label class="label" for="certificationName">
          <span class="label-text">Certification Name</span>
        </label>
        <input
          type="text"
          id="certificationName"
          bind:value={certificationName}
          class="input input-bordered w-full"
          placeholder="e.g. AWS Certified Developer"
          required
        />
      </div>

      <!-- Issuing Organization -->
      <div class="form-control">
        <label class="label" for="certificationIssuer">
          <span class="label-text">Issuing Organization</span>
        </label>
        <input
          type="text"
          id="certificationIssuer"
          bind:value={certificationIssuer}
          class="input input-bordered w-full"
          placeholder="e.g. Amazon Web Services"
          required
        />
      </div>

      <!-- Issue Date -->
      <div class="form-control">
        <label class="label" for="certificationDate">
          <span class="label-text">Issue Date</span>
        </label>
        <input
          type="date"
          id="certificationDate"
          bind:value={certificationDate}
          class="input input-bordered w-full"
          required
        />
      </div>

      <!-- Certificate File -->
      <div class="form-control">
        <label class="label" for="certificationFile">
          <span class="label-text">Upload Certificate</span>
        </label>
        <Uploader
          id="certificationFile"
          label="Upload Certificate"
          maxFiles={1}
          customClass="w-full"
          onChange={handleCertificationUpload}
        />
      </div>

      <!-- Modal Actions -->
      <div class="modal-action">
        <button 
          type="button" 
          class="btn btn-primary" 
          onclick={addCertification}
          disabled={isLoading || !certificationName || !certificationIssuer || !certificationDate || !certificationFile}
        >
          {#if isLoading}
            <span class="loading loading-spinner"></span>
          {/if}
          Add Certification
        </button>
        <button class="btn">Close</button>
      </div>
    </form>
  </div>
</dialog>

<!-- Success Toast -->
<div id="skills-toast-success" class="toast toast-end" style="display: none;">
  <div class="alert alert-success">
    <span>Skills updated successfully!</span>
  </div>
</div> 