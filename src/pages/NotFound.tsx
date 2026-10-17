import { Button, Result } from 'antd'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <Result
      status="404"
      title="404"
      subTitle="Nie ma takiej strony."
      extra={
        <Link to="/">
          <Button type="primary">Wróć na Home</Button>
        </Link>
      }
    />
  )
}
