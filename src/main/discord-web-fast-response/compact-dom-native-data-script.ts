export const compactDiscordNativeDataScript = `
    const nativeMatches = (selector) => Array.from(document.querySelectorAll(selector)).filter((element) => !element.closest('#' + managerId));
    const guilds = () => nativeMatches('[role="treeitem"][data-list-item-id^="guildsnav___"]').flatMap((element) => {
      const match = element.getAttribute('data-list-item-id')?.match(guildPattern);
      if (!match) return [];
      return [{ id: match[1], element, name: elementName(element, 'Server'), image: imageSource(element) }];
    });
    const directMessages = () => {
      const seen = new Set();
      return nativeMatches('a[href^="/channels/@me/"]').flatMap((element) => {
        const href = element.getAttribute('href') || '';
        if (!dmPattern.test(href) || seen.has(href)) return [];
        seen.add(href);
        return [{ href, name: elementName(element, 'Direct message'), image: imageSource(element) }];
      });
    };
    const discordHome = () => nativeMatches('[data-list-item-id="guildsnav___home"]').find((element) => element instanceof window.HTMLElement) || null;
    const directMessageLink = (href) => nativeMatches('a[href^="/channels/@me/"]').find((element) => element instanceof window.HTMLAnchorElement && element.getAttribute('href') === href) || null;
    const voiceBelongsToServer = (element, serverId) => {
      let ancestor = element.parentElement;
      while (ancestor) {
        const serverIds = new Set(nativeMatches('a[href^="/channels/"][data-list-item-id^="channels___"]')
          .filter((candidate) => ancestor.contains(candidate))
          .flatMap((candidate) => candidate.getAttribute('href')?.match(serverChannelPattern)?.[1] || []));
        if (serverIds.has(serverId)) return serverIds.size === 1;
        if (ancestor === document.body) return false;
        ancestor = ancestor.parentElement;
      }
      return false;
    };
    const serverChannels = (serverId) => {
      const seen = new Set();
      return nativeMatches('[data-list-item-id^="channels___"]').flatMap((element) => {
        const id = element.getAttribute('data-list-item-id')?.match(channelPattern)?.[1];
        if (!id || seen.has(id)) return [];
        const href = element.getAttribute('href');
        const isText = href === '/channels/' + serverId + '/' + id;
        const isVoice = element.matches('a[role="button"]:not([href])') && voiceBelongsToServer(element, serverId);
        if (!isText && !isVoice) return [];
        seen.add(id);
        return [{ id, href: isText ? href : null, voice: isVoice, name: channelName(element, isVoice ? 'Voice channel' : 'Channel') }];
      });
    };
`
