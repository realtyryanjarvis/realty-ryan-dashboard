# Alt3 Smart Homes — Auto-Posting Setup Guide

## Platform Comparison

| Platform | Free Tier | IG Auto-Post | Reels | Carousels | Best For |
|----------|-----------|-------------|-------|-----------|----------|
| **Meta Business Suite** | ✅ Fully free | ✅ | ✅ | ✅ | Free, native, reliable |
| **Later** | 5 posts/mo | ✅ | ✅ | ✅ | Visual planning, link-in-bio |
| **Buffer** | 10 posts/channel | ✅ | ✅ | ✅ | Simple UI, small teams |
| **Planoly** | 1 social set | ✅ | ✅ | ✅ | Visual-first brands |
| **Hootsuite** | No free tier | ✅ | ✅ | ✅ | Enterprise, multi-brand |

## Recommendation: Meta Business Suite + Buffer

**Primary: Meta Business Suite (free)**
- Best option for a small luxury brand. Fully free, direct integration, supports all post types including Reels and Carousels.
- Built-in insights and audience analytics.

**Secondary: Buffer ($6/mo per channel)**
- Cleaner scheduling UI, better calendar view, and the ability for Jarvis to schedule via API.
- Free tier gives 10 scheduled posts per channel — enough for ~2 weeks if supplemented with Meta Business Suite.

---

## Setup Requirements

### Step 1: Meta Business Account
1. Go to business.facebook.com → Create a Business Account
2. Business name: "Alt3 Smart Homes"
3. Add Ryan as admin

### Step 2: Facebook Page
1. Create a Facebook Page for Alt3 Smart Homes (required for Instagram API access)
2. Doesn't need to be actively used — it's the bridge to Instagram Graph API
3. Fill in: profile photo (Alt3 logo), cover image, about section, website URL

### Step 3: Instagram Professional Account
1. On the Alt3 Instagram account → Settings → Account → Switch to Professional Account → Business
2. Connect to the Alt3 Facebook Page
3. This enables: insights, auto-posting, contact buttons, and API access

### Step 4: Link Everything
1. In Meta Business Suite → Settings → Accounts → Instagram Accounts → Connect
2. Verify the Alt3 Instagram account appears under the business
3. You should now see Instagram in Meta Business Suite's posting interface

### Step 5: Test Scheduling
1. Go to Meta Business Suite → Planner → Create Post
2. Select Instagram (and Facebook if desired)
3. Upload media, write caption, schedule time
4. Confirm it posts at scheduled time

---

## Buffer API Setup (for Jarvis Integration)

### Why Buffer?
Buffer has a simple REST API that Jarvis can use to schedule posts programmatically. Meta's Graph API is more complex and has stricter review requirements.

### Setup Steps:
1. **Create Buffer account** → buffer.com → connect Instagram channel
2. **Get API access token:**
   - Go to buffer.com/developers
   - Register an application
   - Get an access token (personal token for single-user use)
3. **API endpoint for scheduling:**
   ```
   POST https://api.bufferapp.com/1/updates/create.json
   ```
   **Parameters:**
   - `access_token` — your token
   - `profile_ids[]` — Instagram profile ID from Buffer
   - `text` — caption
   - `media[photo]` — image URL
   - `scheduled_at` — ISO 8601 timestamp

### How Jarvis Can Help:
- **Draft captions** from the content calendar
- **Schedule posts** via Buffer API with one command
- **Remind Ryan** to approve/review before posting
- **Track what's been posted** vs. what's upcoming
- **Generate hashtag sets** and rotate them

### Example Jarvis Workflow:
```
1. Ryan: "Schedule this week's posts"
2. Jarvis reads content-calendar.md for the current week
3. Jarvis calls Buffer API to schedule each post
4. Ryan reviews in Buffer dashboard and approves
5. Posts go live at scheduled times
```

---

## Instagram Graph API (Direct — Advanced)

For direct API posting without Buffer, you need:

1. **Meta App** — developers.facebook.com → Create App → Business type
2. **Permissions needed:**
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
3. **App Review** — Meta requires review for `instagram_content_publish`. This takes 1–4 weeks.
4. **Process:**
   - Upload media to a hosting URL (or use a container)
   - Create a media container via API
   - Publish the container
5. **Limitations:**
   - 25 posts per 24-hour period
   - Reels must be hosted videos (URL, not upload)
   - Carousels supported (up to 10 items)
   - Stories NOT supported via API (must be manual or use Meta Business Suite)

### API Endpoints:
```
# Create image container
POST https://graph.facebook.com/v18.0/{ig-user-id}/media
  ?image_url={url}&caption={text}&access_token={token}

# Publish
POST https://graph.facebook.com/v18.0/{ig-user-id}/media_publish
  ?creation_id={container-id}&access_token={token}
```

**Verdict:** Use Buffer API for now. Pursue Graph API later if volume increases or you want full automation.

---

## What Ryan Needs to Do (Action Items)

- [ ] Create Meta Business Account (if not existing)
- [ ] Create Alt3 Smart Homes Facebook Page
- [ ] Switch Alt3 Instagram to Professional/Business account
- [ ] Link Instagram to Facebook Page in Meta Business Suite
- [ ] Create Buffer account and connect Instagram
- [ ] Get Buffer API access token → share with Jarvis
- [ ] Test one scheduled post via Meta Business Suite
- [ ] Test one scheduled post via Buffer

---

## Free Tier Limitations Summary

| Platform | Free Limit | What You Lose |
|----------|-----------|---------------|
| Meta Business Suite | Unlimited | Nothing — it's full featured |
| Buffer | 10 posts/channel | No analytics, no approval workflows |
| Later | 5 posts/month | Basically unusable for free |
| Planoly | 1 social set, 30 uploads | Limited but workable for one brand |

**Bottom line:** Meta Business Suite handles everything for free. Add Buffer ($6/mo) only if you want Jarvis to auto-schedule via API.
