<script lang="ts">
  import type { Photographer } from "../types";
  import { openUrl, setPhotographerInfo } from "../ipc";
  import Pencil from "@lucide/svelte/icons/pencil";

  let {
    root,
    photographer,
  }: { root: string; photographer: Photographer } = $props();

  let instagram = $state<string | null>(null);
  let blurb = $state<string | null>(null);
  let website = $state<string | null>(null);
  let editing = $state(false);
  let draftInstagram = $state("");
  let draftBlurb = $state("");
  let draftWebsite = $state("");

  // Drive local state from the prop reactively — resets when photographer changes.
  $effect(() => {
    instagram = photographer.instagram;
    blurb = photographer.blurb;
    website = photographer.website;
    editing = false;
  });

  function startEdit() {
    draftInstagram = instagram ?? "";
    draftBlurb = blurb ?? "";
    draftWebsite = website ?? "";
    editing = true;
  }

  function cancel() {
    editing = false;
  }

  function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const ig = draftInstagram.trim().replace(/^@/, "") || null;
    const b = draftBlurb.trim() || null;
    const w = draftWebsite.trim() || null;
    void setPhotographerInfo(root, photographer.relPath, ig, b, w);
    instagram = ig;
    blurb = b;
    website = w;
    editing = false;
  }
</script>

<aside class="bio" aria-label="Photographer bio">
  {#if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <form class="form" onsubmit={onSubmit}>
      <textarea
        class="field blurb-input"
        placeholder="Short bio…"
        rows={5}
        autofocus
        bind:value={draftBlurb}
        onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
      ></textarea>
      <div class="ig-row">
        <span class="at">@</span>
        <input
          class="field ig-input"
          type="text"
          placeholder="instagram handle"
          bind:value={draftInstagram}
          onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
        />
      </div>
      <input
        class="field"
        type="url"
        placeholder="https://yoursite.com"
        bind:value={draftWebsite}
        onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
      />
      <button class="save" type="submit">Save</button>
    </form>
  {:else}
    <div class="display">
      {#if blurb}
        <p class="blurb">{blurb}</p>
      {/if}
      {#if instagram}
        <button
          class="ig-link"
          type="button"
          onclick={() => void openUrl(`https://instagram.com/${instagram}`)}
        >@{instagram}</button>
      {/if}
      {#if website}
        <button
          class="ig-link"
          type="button"
          onclick={() => void openUrl(website!)}
        >{website}</button>
      {/if}
    </div>
    <button class="pencil" type="button" onclick={startEdit} aria-label="Edit photographer info">
      <Pencil size={13} aria-hidden="true" />
    </button>
  {/if}
</aside>

<style>
  .bio {
    flex: none;
    width: 300px;
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    overflow-y: auto;
    background: #1e1e1e;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
  }

  .pencil {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.3rem;
    border-radius: 0.3rem;
    color: var(--fg-dim);
    opacity: 0.5;
    transition: opacity 0.12s;
  }

  .pencil:hover {
    opacity: 1;
  }

  .display {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-top: 0.25rem;
    /* leave room for the pencil button */
    padding-right: 1.5rem;
  }

  .blurb {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--fg);
    /* 3-line clamp */
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .ig-link {
    align-self: flex-start;
    font-size: 0.78rem;
    color: var(--accent);
    text-decoration: none;
  }

  .ig-link:hover {
    text-decoration: underline;
  }

  /* Edit form */
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .field {
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.6rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.4rem;
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    resize: none;
  }

  .field:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .ig-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .at {
    font-size: 0.8rem;
    color: var(--fg-dim);
    flex: none;
  }

  .ig-input {
    flex: 1;
  }

  .save {
    align-self: flex-end;
    padding: 0.3rem 0.8rem;
    font-size: 0.8rem;
    border-radius: 0.4rem;
    background: var(--accent);
    color: #000;
    font-weight: 600;
  }

  .save:hover {
    filter: brightness(1.1);
  }
</style>
