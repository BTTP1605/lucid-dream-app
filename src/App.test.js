import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app title', () => {
  render(<App />);
  const heading = screen.getByText('明晰夢誘導アプリ');
  expect(heading).toBeInTheDocument();
});
