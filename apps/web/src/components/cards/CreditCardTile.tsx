import React from 'react';
import { Box, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ContactlessIcon from '@mui/icons-material/Contactless';
import { useTranslation } from 'react-i18next';
import type { CreditCard } from '../../services/credit-cards.api';
import { maskLast4 } from '../../utils/format';
import { MaskedAmount } from './MaskedAmount';
import { DetailRow, StatementDetails } from './StatementDetails';
import { NetworkMark } from './NetworkMark';
import { cardDesign } from './cardBrands';
import { cardLabel, cardPagePath } from './cardPage';

/** ISO/IEC 7810 ID-1, the size of a bank card. */
const CARD_ASPECT_RATIO = '85.6 / 53.98';

const statusColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'BLOCKED') return 'error';
  if (status === 'EXPIRED') return 'warning';
  return 'default';
};

interface AmountRowProps {
  readonly label: string;
  readonly amount: number | null;
}

/**
 * Masked like every other amount on the dashboard. Renders nothing for an unknown amount, which is
 * the norm for cards found in bank emails.
 */
const AmountRow: React.FC<AmountRowProps> = ({ label, amount }) =>
  amount === null ? null : (
    <DetailRow label={label}>
      <MaskedAmount value={amount} label={label} />
    </DetailRow>
  );

interface CreditCardTileProps {
  readonly card: CreditCard;
  readonly isDownloading: boolean;
  /** Absent when mailbox features are off, since statements are fetched from the mailbox. */
  readonly onDownload?: (statementId: string) => void;
}

const FADED_SX = { opacity: 0.85 } as const;
const ROW_SX = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 1 };
const CHIP_GOLD = 'linear-gradient(135deg, #E9C46A 0%, #C9A227 50%, #F2D98D 100%)';

/** The EMV chip, drawn rather than shipped as an image. */
const EmvChip: React.FC = () => (
  <Box
    aria-hidden
    sx={{ width: 34, height: 26, borderRadius: 1, background: CHIP_GOLD, opacity: 0.95 }}
  />
);

interface CardFaceProps {
  readonly card: CreditCard;
}

/**
 * The card drawn like the physical card: its product's or bank's design, the bank's name top left
 * and the card's own name top right, chip, masked number, name on card, expiry and network mark.
 * Details an email did not reveal are left out.
 */
export const CardFace: React.FC<CardFaceProps> = ({ card }) => {
  const { t } = useTranslation('cards');
  const design = cardDesign(card.issuingBank, card.cardName);
  const hasExpiry = card.expiryMonth !== null && card.expiryYear !== null;

  return (
    <Box
      sx={{
        aspectRatio: CARD_ASPECT_RATIO,
        borderRadius: 2,
        p: 2,
        color: design.ink === 'light' ? 'common.white' : 'grey.900',
        background: design.background,
        boxShadow: 2,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Box sx={{ ...ROW_SX, alignItems: 'flex-start' }}>
        <Typography variant="subtitle2" component="h2" fontWeight={800} letterSpacing={0.5}>
          {design.bankCode ? t(`banks.${design.bankCode}` as 'banks.HDFC') : card.issuingBank}
        </Typography>
        {card.cardName && (
          <Typography variant="subtitle1" fontWeight={700} textAlign="right" lineHeight={1.2}>
            {card.cardName}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <EmvChip />
        <ContactlessIcon fontSize="small" sx={FADED_SX} aria-hidden />
      </Box>
      <Box>
        {card.cardNumberLast4 && (
          <Typography variant="h6" sx={{ fontFamily: 'monospace', letterSpacing: 2 }}>
            {maskLast4(card.cardNumberLast4)}
          </Typography>
        )}
        <Box sx={ROW_SX}>
          <Box>
            {hasExpiry && (
              <Typography variant="caption" display="block" sx={FADED_SX}>
                {t('expiresOn')} {String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}
              </Typography>
            )}
            {card.nameOnCard && (
              <Typography variant="caption" display="block" letterSpacing={1} fontWeight={600}>
                {card.nameOnCard.toUpperCase()}
              </Typography>
            )}
          </Box>
          <NetworkMark network={card.cardNetwork} />
        </Box>
      </Box>
    </Box>
  );
};

/** The branded card face (a link to the card's page), then any amounts and the latest statement. */
export const CreditCardTile: React.FC<CreditCardTileProps> = ({
  card,
  isDownloading,
  onDownload,
}) => {
  const { t } = useTranslation('cards');
  const { t: tCommon } = useTranslation('common');

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <CardActionArea
          component={RouterLink}
          to={cardPagePath(card.id)}
          aria-label={t('history.open', { card: cardLabel(card) })}
          sx={{ borderRadius: 2 }}
        >
          <CardFace card={card} />
        </CardActionArea>
        {/* A real card carries no status, so it sits under the face. */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Chip
            label={tCommon(`status.${card.status.toLowerCase()}` as 'status.active')}
            color={statusColor(card.status)}
            size="small"
            variant="outlined"
          />
        </Box>
        <Stack spacing={0.5} mt={0.5}>
          <AmountRow label={t('creditLimit')} amount={card.creditLimit} />
          <AmountRow label={t('availableCredit')} amount={card.availableCredit} />
          <AmountRow label={t('currentBalance')} amount={card.currentBalance} />
        </Stack>
        <StatementDetails
          statement={card.latestStatement}
          isDownloading={isDownloading}
          onDownload={onDownload}
        />
      </CardContent>
    </Card>
  );
};
