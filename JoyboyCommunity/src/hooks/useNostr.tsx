import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Event as EventNostr, SimplePool} from 'nostr-tools';
import {finalizeEvent, NostrEvent, parseReferences, VerifiedEvent, verifyEvent} from 'nostr-tools';

import {useNostrContext} from '../context/NostrContext';
import {IPoolEventsByQuery, IPoolEventsFromPubkey, ISendNotePayload, IUserQuery} from '../types';
import {JOYBOY_RELAYS} from '../utils/relay';

export const useGetPoolEventById = (id: string) => {
  const {pool, relays} = useNostrContext();

  return useQuery({
    queryFn: async () => {
      const data = await pool.get(relays, {ids: [id]}, {});

      // const parseEvent = parsingEventContent(data) as unknown as EventNostr;
      return data as EventNostr;
    },
    queryKey: ['getPoolEventById', id],
  });
};

export const useGetPoolEvents = () => {
  const {pool, relays} = useNostrContext();

  return useQuery({
    queryFn: () => pool.querySync(relays, {kinds: [0, 1]}, {}),
    queryKey: ['getPoolEvents'],
  });
};

export const useGetPoolEventsNotes = () => {
  const {pool, relays} = useNostrContext();

  return useQuery({
    queryFn: () => pool.querySync(relays, {kinds: [1]}, {}),
    queryKey: ['getPoolEventsNotes'],
  });
};

export const useGetPoolEventUser = () => {
  const {pool, relays} = useNostrContext();

  return useQuery({
    queryFn: () => pool.querySync(relays, {kinds: [0]}, {}),
    queryKey: ['getPoolEventUser'],
  });
};

export const useGetPoolEventsFromPubkey = (query: IPoolEventsFromPubkey) => {
  const {pool, relays} = useNostrContext();

  return useQuery({
    queryFn: () =>
      pool.querySync(query.relaysUser ?? relays, {
        kinds: query.kinds ?? [1, 3],
        authors: [query.pubkey],
      }),
    queryKey: ['getPoolEventsFromPubkey', query.relaysUser, query.kinds],
    placeholderData: [],
  });
};

export const useGetPoolUserQuery = ({id = '0', ...query}: IUserQuery) => {
  const {pool, relays} = useNostrContext();

  return useQuery({
    queryFn: () =>
      pool.get(relays, {
        kinds: [Number(id)],
        authors: [query.pubkey],
      }),
    queryKey: ['getPoolUserQuery', id, query.pubkey],
  });
};

export const useGetPoolEventsByQuery = ({
  ids = ['1', '3'],
  kinds = [1],
  filter,
  pool = new SimplePool(),
  relaysToUsed,
}: IPoolEventsByQuery) => {
  return useQuery({
    queryFn: () =>
      pool?.querySync(relaysToUsed, {
        ids,
        kinds,
        ...filter,
      }),
    queryKey: ['getPoolEventsByQuery', ids, kinds, filter, relaysToUsed, pool],
    placeholderData: [],
  });
};

export const useGetPoolEventsTagsByQuery = ({
  ids,
  kinds = [1],
  filter,
  pool = new SimplePool(),
  relaysToUsed,
}: IPoolEventsByQuery) => {
  return useQuery({
    queryFn: () =>
      pool?.querySync(relaysToUsed, {
        ids,
        kinds,
        ...filter,
      }),
    enabled: !!filter?.search,
    queryKey: ['getPoolEventsByQuery', ids, kinds, filter, pool, relaysToUsed],
    placeholderData: [],
  });
};

export const useGetPoolEventsNotesFromPubkey = (query: IPoolEventsFromPubkey) => {
  const {pool, relays} = useNostrContext();

  return useQuery({
    queryFn: () =>
      pool.querySync(query.relaysUser ?? relays, {
        kinds: query.kinds ?? [1],
        authors: [query.pubkey],
      }),
    queryKey: ['getPoolEventsNotesFromPubkey', query.relaysUser, query.kinds],
    placeholderData: [],
  });
};

export const useGetUser = (pubkey: string) => {
  const {ndk} = useNostrContext();

  return useQuery({
    queryFn: () => ndk.getUser({pubkey}),
    queryKey: ['getUser', pubkey],
  });
};

/** Check if a note is valid and publish not on relayer if event valid */
export const useSendNote = () => {
  const queryClient = useQueryClient();
  const {pool, relays, connectRelayJoyboy} = useNostrContext();

  return useMutation({
    mutationFn: isValidSendNote,
    async onSuccess(data) {
      queryClient.invalidateQueries({
        queryKey: [''],
      });
      const event = data?.event;
      /** @TODO add option to send note on different relays and add list of relays */
      await pool.publish(JOYBOY_RELAYS, event);
      return data;
    },
  });
};

// FUNCTIONS

export const isValidSendNote = async ({
  content,
  sk,
  tags,
}: ISendNotePayload): Promise<{
  event?: VerifiedEvent;
  isValid?: boolean;
}> => {
  try {
    const event = finalizeEvent(
      {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: tags ?? [],
        content,
      },
      sk,
    );
    console.log('event', event);

    const isGood = verifyEvent(event);

    if (!isGood) {
      return {
        event,
        isValid: false,
      };
    }

    return {
      event,
      isValid: true,
    };
  } catch (e) {
    console.log('issue sendNote', e);
    return {
      event: undefined,
      isValid: false,
    };
  }
};

export const parsingEventContent = (event?: NostrEvent) => {
  try {
    const references = parseReferences(event);
    const simpleAugmentedContent = event.content;

    let profilesCache;
    let eventsCache;
    for (let i = 0; i < references.length; i++) {
      const {text, profile, event, address} = references[i];
      const augmentedReference = profile ? (
        <strong>@${profilesCache[profile.pubkey].name}</strong>
      ) : event ? (
        <em>${eventsCache[event.id].content.slice(0, 5)}</em>
      ) : address ? (
        <a href="${text}">[link]</a>
      ) : (
        text
      );
      // simpleAugmentedContent.replaceAll(text, augmentedReference);
      simpleAugmentedContent.replaceAll(text, augmentedReference?.toString());
    }

    return simpleAugmentedContent;
  } catch (e) {}
};

/** @TODO finish Give NIP05 parsed content */
export const parsingNip05EventContent = (event?: NostrEvent) => {
  try {
    const references = parseReferences(event);
    const simpleAugmentedContent = event.content;
    let profilesCache;
    const stringify = JSON.parse(simpleAugmentedContent);
    return stringify;
  } catch (e) {}
};

export const useRevalidate = () => {
  const queryClient = useQueryClient();
  const revalidate = (keys: string) => {
    queryClient.invalidateQueries({
      queryKey: [keys],
      refetchType: 'active',
    });
  };

  return {
    revalidate,
  };
};
