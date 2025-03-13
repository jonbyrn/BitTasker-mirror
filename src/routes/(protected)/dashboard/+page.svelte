<script lang="ts">
  import { user, logout } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  
  function handleLogout(): void {
    logout().then(() => {
      goto('/auth');
    });
  }
</script>

<div class="dashboard">
  <header>
    <h1>Dashboard</h1>
    <div class="user-info">
      {#if $user}
        <span>Welcome, {$user.name || $user.email}</span>
        <button on:click={handleLogout}>Logout</button>
      {/if}
    </div>
  </header>
  
  <main>
    <p>This is a protected route. Only authenticated users can see this page.</p>
    
    <div class="user-details">
      <h2>Your Profile</h2>
      {#if $user}
        <dl>
          <dt>Name</dt>
          <dd>{$user.name || 'Not provided'}</dd>
          
          <dt>Email</dt>
          <dd>{$user.email || 'Not provided'}</dd>
          
          <dt>User ID</dt>
          <dd>{$user.id || 'Not available'}</dd>
        </dl>
      {/if}
    </div>
    
    <div class="dashboard-cards">
      <div class="card">
        <h3>Profile</h3>
        <p>View and edit your profile information</p>
        <a href="/profile">View Profile</a>
      </div>
      <div class="card">
        <h3>Settings</h3>
        <p>Manage your account settings</p>
        <a href="/settings">Go to Settings</a>
      </div>
    </div>
  </main>
</div>

<style>
  .dashboard {
    padding: 1rem;
  }
  
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .user-info button {
    padding: 0.5rem 1rem;
    background-color: #e53e3e;
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  
  .user-details {
    background-color: #f9fafb;
    padding: 1.5rem;
    border-radius: 0.5rem;
    margin-bottom: 2rem;
  }
  
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.5rem 1rem;
  }
  
  dt {
    font-weight: bold;
  }
  
  .dashboard-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }
  
  .card {
    padding: 1.5rem;
    border-radius: 0.5rem;
    background-color: #f7fafc;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .card a {
    display: inline-block;
    margin-top: 1rem;
    color: #4299e1;
    text-decoration: none;
  }
  
  .card a:hover {
    text-decoration: underline;
  }
</style>