import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Progress, Row, Skeleton, Statistic, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useGetPlanetsQuery } from '../../app/api'
import { useAppSelector } from '../../app/hooks'
import type { Planet } from '../../app/api'
import { formatEarthMasses, formatMass, toEarthMasses } from './format'

export default function PlanetsView() {
  const showShareBar = useAppSelector((state) => state.settings.showShareBar)
  const { data, error, isLoading, isFetching, refetch } = useGetPlanetsQuery()

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        title="Nie udało się pobrać planet"
        description="Sprawdź, czy działa `netlify dev` i czy migracje bazy zostały zastosowane."
        action={<Button onClick={refetch}>Spróbuj ponownie</Button>}
      />
    )
  }

  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 8 }} />

  const heaviest = data[data.length - 1]
  const lightest = data[0]
  const maxMass = Number(heaviest.mass_kg)

  const columns: TableColumnsType<Planet> = [
    { title: '#', key: 'rank', width: 56, render: (_v, _r, index) => index + 1 },
    {
      title: 'Planeta',
      dataIndex: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    {
      title: 'Masa',
      dataIndex: 'mass_kg',
      defaultSortOrder: 'ascend',
      sorter: (a, b) => Number(a.mass_kg) - Number(b.mass_kg),
      render: (kg: string) => formatMass(kg),
    },
    {
      title: 'Mas Ziemi',
      key: 'earth',
      render: (_v, planet) => <Tag>{formatEarthMasses(toEarthMasses(planet.mass_kg))} M⊕</Tag>,
    },
    ...(showShareBar
      ? [
          {
            title: 'Względem Jowisza',
            key: 'share',
            width: 220,
            render: (_v: unknown, planet: Planet) => (
              <Progress
                percent={Math.max((Number(planet.mass_kg) / maxMass) * 100, 1)}
                showInfo={false}
                size="small"
              />
            ),
          },
        ]
      : []),
  ]

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Liczba planet" value={data.length} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Najlżejsza" value={lightest.name} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Najcięższa" value={heaviest.name} />
          </Card>
        </Col>
      </Row>

      <Card
        title="Układ Słoneczny"
        extra={
          <Button icon={<ReloadOutlined />} loading={isFetching} onClick={refetch}>
            Odśwież
          </Button>
        }
        style={{ marginTop: 16 }}
      >
        <Table<Planet>
          rowKey="id"
          columns={columns}
          dataSource={data}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </>
  )
}
