<script>
  import {
    Page,
    Navbar,
    NavbarBackLink,
    Block,
    BlockTitle,
    List,
    ListItem,
    Button,
    Link,
    Card,
    Icon,
    Searchbar,
  } from 'konsta/svelte';

  const latestTasks = [
    {
      title: "Website Redesign",
      price: "0.015",
      description: "Need a modern redesign for my personal portfolio website. Must be responsive and fast.",
      postedAgo: "2h ago"
    },
    {
      title: "Smart Contract Audit",
      price: "0.025",
      description: "Looking for an experienced Solidity developer to audit my DeFi protocol smart contracts.",
      postedAgo: "4h ago"
    },
    {
      title: "Logo Design",
      price: "0.008",
      description: "Need a minimalist logo design for my tech startup. Should be modern and memorable.",
      postedAgo: "6h ago"
    },
    {
      title: "Mobile App Testing",
      price: "0.012",
      description: "Looking for QA testers for my iOS fitness app. Need thorough testing and bug reports.",
      postedAgo: "8h ago"
    },
    {
      title: "Content Writing",
      price: "0.005",
      description: "Need 5 blog posts about cryptocurrency and DeFi. Must be well-researched and engaging.",
      postedAgo: "12h ago"
    },
    {
      title: "Video Editing",
      price: "0.018",
      description: "Need a professional video editor for my YouTube crypto channel. 3-4 videos per week.",
      postedAgo: "16h ago"
    },
    {
      title: "NFT Collection Design",
      price: "0.035",
      description: "Looking for an artist to create a collection of 100 unique NFT artworks with a cyberpunk theme.",
      postedAgo: "18h ago"
    },
    {
      title: "Python Data Analysis",
      price: "0.022",
      description: "Need help analyzing cryptocurrency market data using Python. Must be familiar with pandas and matplotlib.",
      postedAgo: "20h ago"
    },
    {
      title: "Social Media Management",
      price: "0.016",
      description: "Seeking a social media manager for our DeFi project. Experience with crypto community management required.",
      postedAgo: "22h ago"
    },
    {
      title: "3D Product Rendering",
      price: "0.028",
      description: "Need photorealistic 3D renders of a new hardware wallet design. Must provide source files.",
      postedAgo: "23h ago"
    },
    {
      title: "Technical Writing",
      price: "0.014",
      description: "Looking for a technical writer to create documentation for our blockchain API. Must understand Web3.",
      postedAgo: "1d ago"
    },
    {
      title: "UI/UX Consultation",
      price: "0.020",
      description: "Need a UX expert to review and improve our DeFi platform's user interface and user flow.",
      postedAgo: "1d ago"
    }
  ];
</script>

<style>
  .hide-scrollbar {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
  }
  .hide-scrollbar::-webkit-scrollbar {
    display: none;  /* Chrome, Safari and Opera */
  }
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>

<Page>

  <!-- Hero Section -->
  <Block class="text-gray-900 dark:text-white py-16">
    <div class="max-w-4xl mx-auto text-center">
      <div class="flex items-center justify-center mb-4">
        <img src="/Bitcoin-Logo.png" alt="Bitcoin Logo" class="h-[100px] w-auto" />
        <h1 class="text-7xl font-bold">ittasker</h1>
      </div>
      <p class="text-xl mb-2">Connect with professionals and get tasks done. Pay in Bitcoin or Fiat.</p>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-8">Built on top of Nostr technology</p>
      <Searchbar
        placeholder="Search tasks or services..."
        class="max-w-2xl mx-auto backdrop-blur px-4 sm:px-0 w-full sm:w-auto"
      />
    </div>
  </Block>

  <!-- Latest Tasks Section -->
  <Block>
    <BlockTitle large="true" class="px-4 mb-8">Latest Tasks</BlockTitle>
    <div class="flex overflow-x-auto gap-6 px-4 pb-4 snap-x snap-mandatory hide-scrollbar">
      {#each latestTasks as task}
        <div class="snap-center shrink-0" style="width: 320px;">
          <Card outline class="h-[250px]">
            <div class="p-4 flex flex-col h-full">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">{task.title}</h3>
              <div class="flex items-center gap-2 mb-3">
                <span class="text-primary font-medium">₿{task.price}</span>
                <span class="text-sm text-gray-500 dark:text-gray-400">· {task.postedAgo}</span>
              </div>
              <p class="text-gray-600 dark:text-gray-400 mb-4 flex-grow line-clamp-3">{task.description}</p>
              <div class="mt-auto">
                <Button small>View Details</Button>
              </div>
            </div>
          </Card>
        </div>
      {/each}
    </div>
  </Block>


  <!-- Task Categories -->
  <Block>
    <BlockTitle large="true" class="px-4 mb-8">Get it done today</BlockTitle>
    <p class="px-4 mb-8">To-do list never getting shorter? Take the burden off and find the help you need on Bittasker.</p>
    
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-4">
      <Card strong inset class="flex items-center justify-center p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
        <Link href="/category/business" class="flex flex-col items-center justify-center text-gray-900 dark:text-white">
          <div class="mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008h-.008V12.75v-.008z" />
            </svg>
          </div>
          <span class="text-sm font-medium text-center">Business & Admin</span>
        </Link>
      </Card>

      <Card strong inset class="flex items-center justify-center p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
        <Link href="/category/computers" class="flex flex-col items-center justify-center text-gray-900 dark:text-white">
          <div class="mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
            </svg>
          </div>
          <span class="text-sm font-medium text-center">Computers & IT</span>
        </Link>
      </Card>

      <Card strong inset class="flex items-center justify-center p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
        <Link href="/category/furniture" class="flex flex-col items-center justify-center text-gray-900 dark:text-white">
          <div class="mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h.008v.008h-.008V21v-.008z" />
            </svg>
          </div>
          <span class="text-sm font-medium text-center">Furniture Assembly</span>
        </Link>
      </Card>

      <Card strong inset class="flex items-center justify-center p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
        <Link href="/category/handyman" class="flex flex-col items-center justify-center text-gray-900 dark:text-white">
          <div class="mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <span class="text-sm font-medium text-center">Handyman</span>
        </Link>
      </Card>

      <Card strong inset class="flex items-center justify-center p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
        <Link href="/category/marketing" class="flex flex-col items-center justify-center text-gray-900 dark:text-white">
          <div class="mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.493M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <span class="text-sm font-medium text-center">Marketing & Design</span>
        </Link>
      </Card>

      <Card strong inset class="flex items-center justify-center p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
        <Link href="/category/events" class="flex flex-col items-center justify-center text-gray-900 dark:text-white">
          <div class="mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </div>
          <span class="text-sm font-medium text-center">Events & Photography</span>
        </Link>
      </Card>

      <Card strong inset class="flex items-center justify-center p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
        <Link href="/category/fun" class="flex flex-col items-center justify-center text-gray-900 dark:text-white">
          <div class="mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
            </svg>
          </div>
          <span class="text-sm font-medium text-center">Fun & Quirky</span>
        </Link>
      </Card>

      <Card strong inset class="flex items-center justify-center p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
        <Link href="/category/gardening" class="flex flex-col items-center justify-center text-gray-900 dark:text-white">
          <div class="mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <span class="text-sm font-medium text-center">Home & Gardening</span>
        </Link>
      </Card>

    </div>
  </Block>

  <!-- How It Works Section -->
  <Block class="mt-16 mb-8">
    <BlockTitle large="true" class="px-4 mb-8">How It Works</BlockTitle>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
      <Card
        header="1. Post Your Task"
        footer="Set your budget in Bitcoin and describe what you need"
      >
        <div class="flex justify-center items-center h-40">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-20 h-20">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0021.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
          </svg>
        </div>
      </Card>

      <Card
        header="2. Choose a Professional"
        footer="Review profiles and select the best match"
      >
        <div class="flex justify-center items-center h-40">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-20 h-20">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
      </Card>

      <Card
        header="3. Pay in Bitcoin or Fiat"
        footer="Secure escrow and instant payments with Lightning"
      >
        <div class="flex justify-center items-center h-40">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-20 h-20">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
        </div>
      </Card>
    </div>
  </Block>

  <!-- Popular Categories -->
  <Block strong inset>
    <BlockTitle large="true" class="mb-4">Popular Categories</BlockTitle>
    <List>
      <ListItem
        title="Web Development"
        link
        after="→"
      />
      <ListItem
        title="Design & Creative"
        link
        after="→"
      />
      <ListItem
        title="Writing & Translation"
        link
        after="→"
      />
      <ListItem
        title="Bitcoin Integration"
        link
        after="→"
      />
    </List>
  </Block>

  <Block>
    <div class="text-center py-12">
      <a href="/post-task" class="inline-block bg-primary hover:bg-primary-600 text-white font-semibold text-lg px-8 py-4 rounded-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        Post my task and get offers
      </a>
    </div>
  </Block>

  <!-- Footer -->
  <Block strong inset class="text-white dark:text-gray-200 mt-8 pt-12">
    <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 px-4">
      <div>
        <h3 class="text-lg font-bold mb-4">Bittasker</h3>
        <p class="text-gray-900 dark:text-white">The Bitcoin-first marketplace for tasks and services</p>
      </div>
      
      <div>
        <h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-white">For Clients</h3>
        <List>
          <ListItem title="How it Works" link />
          <ListItem title="Post a Task" link />
          <ListItem title="Find Talent" link />
        </List>
      </div>

      <div>
        <h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-white">For Professionals</h3>
        <List>
          <ListItem title="Sign Up" link />
          <ListItem title="Find Work" link />
          <ListItem title="Get Paid in BTC" link />
        </List>
      </div>

      <div>
        <h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-white">Company</h3>
        <List>
          <ListItem title="About Us" link />
          <ListItem title="Contact" link />
          <ListItem title="Privacy Policy" link />
        </List>
      </div>
    </div>

    <div class="text-center text-gray-400 dark:text-gray-500 mt-8">
      <p> 2025 Bittasker. All rights reserved.</p>
    </div>
  </Block>
</Page>