export const compactDiscordManagerScript = `
    const createToolbar = (title) => {
      const toolbar = document.createElement('div');
      toolbar.className = 'orca-discord-toolbar';
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'orca-discord-back';
      back.dataset.orcaAction = 'back';
      back.setAttribute('aria-label', 'Back');
      back.textContent = '‹';
      const label = createLabel(title);
      label.className = 'orca-discord-title';
      toolbar.append(back, label);
      return toolbar;
    };
    const createManagerTabs = (tab) => {
      const tabs = document.createElement('div');
      tabs.className = 'orca-discord-manager-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Discord hub');
      for (const value of ['servers', 'messages', 'friends']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'orca-discord-manager-tab';
        button.dataset.orcaManagerTab = value;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(value === tab));
        button.textContent = value[0].toUpperCase() + value.slice(1);
        tabs.append(button);
      }
      return tabs;
    };
    const renderServers = (container) => {
      const items = guilds();
      const grid = document.createElement('div');
      grid.className = 'orca-discord-grid';
      for (const guild of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'orca-discord-card';
        button.dataset.orcaGuildId = guild.id;
        button.dataset.orcaGuildName = guild.name;
        button.append(createImage(guild.image, guild.name, 'orca-discord-avatar'), createLabel(guild.name));
        grid.append(button);
      }
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'orca-discord-empty';
        empty.textContent = 'No servers available.';
        grid.append(empty);
      }
      container.replaceChildren(createManagerTabs('servers'), grid);
    };
    const renderServerChannels = (container, mode) => {
      const channels = serverChannels(mode.serverId);
      const list = document.createElement('div');
      list.className = 'orca-discord-list';
      for (const channel of channels) {
        const item = document.createElement('a');
        item.className = 'orca-discord-row orca-discord-channel';
        item.dataset.orcaChannelId = channel.id;
        item.dataset.orcaChannelName = channel.name;
        item.dataset.orcaVoice = channel.voice ? '1' : '0';
        item.setAttribute('role', channel.voice ? 'button' : 'link');
        item.setAttribute('data-list-item-id', 'channels___' + channel.id);
        if (channel.href) item.setAttribute('href', channel.href);
        item.append(createLabel(channel.name));
        list.append(item);
      }
      if (channels.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'orca-discord-empty';
        empty.textContent = 'No available channels.';
        list.append(empty);
      }
      container.replaceChildren(createToolbar(mode.serverName), list);
    };
    const renderMessages = (container) => {
      const items = directMessages();
      const list = document.createElement('div');
      list.className = 'orca-discord-list';
      for (const message of items) {
        const link = document.createElement('a');
        link.className = 'orca-discord-row';
        link.href = message.href;
        link.dataset.orcaDmName = message.name;
        link.append(createImage(message.image, message.name, 'orca-discord-avatar'), createLabel(message.name));
        list.append(link);
      }
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'orca-discord-empty';
        empty.textContent = 'No direct messages available.';
        list.append(empty);
      }
      container.replaceChildren(createManagerTabs('messages'), list);
    };
    const renderFriends = (container) => {
      const empty = document.createElement('div');
      empty.className = 'orca-discord-empty';
      empty.textContent = 'Friends are not available in fast response yet.';
      container.replaceChildren(createManagerTabs('friends'), empty);
    };
    const render = () => {
      if (disposed) return;
      scheduled = false;
      if (!supported()) return;
      ensureStyle();
      markContent();
      const element = ensureManager();
      const signature = [JSON.stringify(current), window.location.pathname, guilds().map((item) => item.id + ':' + item.name).join('|'), directMessages().map((item) => item.href + ':' + item.name).join('|'), current.kind === 'server-channels' ? serverChannels(current.serverId).map((item) => item.id + ':' + item.name).join('|') : ''].join('::');
      if (signature === lastSignature && element.childElementCount > 0) return;
      lastSignature = signature;
      if (current.kind === 'manager' && current.tab === 'servers') renderServers(element);
      else if (current.kind === 'manager' && current.tab === 'messages') renderMessages(element);
      else if (current.kind === 'manager') renderFriends(element);
      else if (current.kind === 'server-channels') renderServerChannels(element, current);
      else element.replaceChildren(createToolbar(current.source.kind === 'server-channel' ? current.source.channelName : current.source.name));
    };
`
