import React from 'react';
import { Alert, Card, CardContent, Grid, Skeleton, Typography } from '@mui/material';

const TileSkeleton: React.FC = () => (
  <Card variant="outlined">
    <CardContent>
      <Skeleton variant="text" width="60%" height={28} />
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rectangular" height={60} sx={{ mt: 1, borderRadius: 1 }} />
    </CardContent>
  </Card>
);

interface TileGridProps<T extends { id: string }> {
  readonly items: readonly T[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly skeletonCount: number;
  readonly errorText: string;
  readonly emptyText: string;
  readonly emptyHint: string;
  readonly renderTile: (item: T) => React.ReactNode;
}

/** A responsive grid of tiles with its loading, error and empty states. */
export const TileGrid = <T extends { id: string }>({
  items,
  isLoading,
  isError,
  skeletonCount,
  errorText,
  emptyText,
  emptyHint,
  renderTile,
}: TileGridProps<T>): React.ReactElement => {
  if (isError) return <Alert severity="error">{errorText}</Alert>;

  if (items?.length === 0) {
    return (
      <Alert severity="info">
        {emptyText}
        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
          {emptyHint}
        </Typography>
      </Alert>
    );
  }

  const tiles = isLoading
    ? Array.from({ length: skeletonCount }, (_value, index) => ({
        key: String(index),
        tile: <TileSkeleton />,
      }))
    : (items ?? []).map((item) => ({ key: item.id, tile: renderTile(item) }));

  return (
    <Grid container spacing={2}>
      {tiles.map(({ key, tile }) => (
        <Grid item xs={12} sm={6} md={4} key={key}>
          {tile}
        </Grid>
      ))}
    </Grid>
  );
};
